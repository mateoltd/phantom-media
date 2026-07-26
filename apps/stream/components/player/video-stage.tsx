"use client";

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Artwork } from "@phantom/ui";
import {
  IconArrowLeft,
  IconBadgeCc,
  IconBadgeCcFilled,
  IconChevronRight,
  IconKeyboard,
  IconLayoutList,
  IconMaximize,
  IconMinimize,
  IconPictureInPicture,
  IconPlayerTrackNextFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRefresh,
  IconRewindBackward10,
  IconRewindForward10,
  IconVolume,
  IconVolume2,
  IconVolumeOff,
  IconX,
} from "@tabler/icons-react";
import { formatTimecode } from "@/lib/media";
import {
  prefsOnServer,
  prefsSnapshot,
  savePrefs,
  subscribePrefs,
  type CaptionSize,
  type PlayerPrefs,
} from "@/lib/player-prefs";
import type { EpisodeSummary } from "@/lib/types";
import { RaceProgress, type RaceProgressModel } from "./race-progress";
import { ScrubBar } from "./scrub-bar";
import { StageSettings, type SettingsSection } from "./stage-settings";
import { UpNext } from "./up-next";
import { useCaptions } from "./use-captions";
import type { Chapter } from "./use-chapters";
import { useVideoState, type TimeListener } from "./use-video-state";

export type StageStatus = "idle" | "working" | "ready" | "error";

export interface StageMenuModel {
  options: readonly { value: string; label: string; detail?: string }[];
  value: string | null;
  onChange: (value: string) => void;
  summary?: string;
}

export interface CaptionChoice {
  /** Index into `tracks`, as a string. */
  value: string;
  label: string;
  detail?: string;
  /** Normalised code, so a language can be remembered between episodes. */
  language: string;
}

export interface StageToast {
  text: string;
  action?: { label: string; onClick: () => void };
}

interface VideoStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  title: string;
  /** Episode identity, shown in the top band beside the title. */
  subtitle?: string;
  poster?: string | null;
  status: StageStatus;
  statusText: string;
  /** The big centre button: starts the search for a playable source. */
  onRequestPlayback: () => void;
  canRequestPlayback: boolean;
  requestLabel: string;
  /** Per-source detail while a race is running. */
  progress?: RaceProgressModel;
  quality?: StageMenuModel;
  /** The source roster, kept in here rather than beside the picture. */
  sources?: StageMenuModel;
  captions?: readonly CaptionChoice[];
  /** `<track>` elements, which have to be children of the media element. */
  tracks?: ReactNode;
  /** Changes when the track list is replaced, so captions re-read it. */
  trackKey?: string;
  /** Said once, dismissible, never blocking. */
  toast?: StageToast | null;
  onDismissToast?: () => void;
  /** Set for a series that has somewhere to go after this episode. */
  onNextEpisode?: () => void;
  onEnded?: () => void;
  /** The episode list, rendered inside the stage so it survives fullscreen. */
  episodePanel?: ReactNode;
  episodesOpen?: boolean;
  onEpisodesOpenChange?: (open: boolean) => void;
  /** Whatever the stream declared. Empty for the many that declare nothing. */
  chapters?: readonly Chapter[];
  /** Offered over the credits. The stage owns the timing; the page owns the
   *  episode and what happens when it is taken. */
  upNext?: { episode: EpisodeSummary; onPlay: () => void };
  children?: ReactNode;
}

const CAPTIONS_OFF = "off";
const IDLE_DELAY_MS = 2600;
const DOUBLE_TAP_MS = 320;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const CUE_SIZE_CLASS: Record<CaptionSize, string> = {
  small: "stage-cues-sm",
  medium: "stage-cues-md",
  large: "stage-cues-lg",
};

/**
 * Picture-in-picture support is a fact about the browser, and the server has
 * no browser. Reading it during render is what made the two trees disagree, so
 * it is read as an external value with an explicit server answer of "no".
 */
const NEVER_CHANGES = () => () => {};
const pipSupported = () => document.pictureInPictureEnabled;
const saysNoOnServer = () => false;

/**
 * Touch and mouse want different things from the same surface: a tap on a
 * phone should show the controls, where a click on a desktop should pause.
 */
const COARSE_QUERY = "(pointer: coarse)";
function subscribeToPointer(listener: () => void) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const isCoarsePointer = () => window.matchMedia(COARSE_QUERY).matches;

const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ["Space / K", "Play or pause"],
  ["← / →", "Back or forward 5 seconds"],
  ["J / L", "Back or forward 10 seconds"],
  ["↑ / ↓", "Volume"],
  ["M", "Mute"],
  ["C", "Subtitles on or off"],
  ["F", "Fullscreen"],
  ["N", "Next episode"],
  ["E", "Episodes"],
  ["< / >", "Slower or faster"],
  ["0–9", "Jump through the runtime"],
  ["?", "This list"],
];

export function VideoStage({
  videoRef,
  title,
  subtitle,
  poster,
  status,
  statusText,
  onRequestPlayback,
  canRequestPlayback,
  requestLabel,
  progress,
  quality,
  sources,
  captions = [],
  tracks,
  trackKey = "",
  toast,
  onDismissToast,
  onNextEpisode,
  onEnded,
  episodePanel,
  episodesOpen = false,
  onEpisodesOpenChange,
  chapters = [],
  upNext,
  children,
}: VideoStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cuesRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const heldAwakeRef = useRef(false);
  const lastTapRef = useRef({ at: 0, x: 0 });

  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  const [skippable, setSkippable] = useState<Chapter | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** Which stream ended, rather than a flag that has to be reset. */
  const [endedKey, setEndedKey] = useState<string | null>(null);

  const prefs: PlayerPrefs = useSyncExternalStore(
    subscribePrefs,
    prefsSnapshot,
    prefsOnServer,
  );
  const canPictureInPicture = useSyncExternalStore(
    NEVER_CHANGES,
    pipSupported,
    saysNoOnServer,
  );
  const coarsePointer = useSyncExternalStore(
    subscribeToPointer,
    isCoarsePointer,
    saysNoOnServer,
  );

  const {
    state,
    subscribeTime,
    togglePlay,
    seekBy,
    seekTo,
    setVolume,
    nudgeVolume,
    toggleMute,
    toggleFullscreen,
    togglePictureInPicture,
  } = useVideoState(videoRef, containerRef);

  const showFlash = useCallback((text: string) => {
    setFlash({ id: Date.now(), text });
  }, []);

  /* ------------------------------------------------------------ preferences */

  const update = useCallback((next: Partial<PlayerPrefs>) => {
    savePrefs(next);
  }, []);

  // Preferences are the source of truth and the element follows them, which is
  // why nothing that changes a setting touches the element itself.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = prefs.playbackRate;
  }, [prefs.playbackRate, videoRef]);

  // Volume is the exception: it is adjusted on the element, by a slider and by
  // the keyboard, so it flows the other way. Debounced, because it is not
  // worth a write per pixel of slider travel.
  const restoredVolumeRef = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!restoredVolumeRef.current) {
      restoredVolumeRef.current = true;
      video.volume = prefs.volume;
      video.muted = prefs.muted;
      return;
    }
    const timer = window.setTimeout(() => {
      savePrefs({ volume: state.volume, muted: state.muted });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [prefs.muted, prefs.volume, state.muted, state.volume, videoRef]);

  const setSpeed = useCallback(
    (rate: number) => {
      update({ playbackRate: rate });
      showFlash(rate === 1 ? "Normal speed" : `${rate}×`);
    },
    [showFlash, update],
  );

  const nudgeSpeed = useCallback(
    (direction: 1 | -1) => {
      const index = SPEEDS.indexOf(prefs.playbackRate as (typeof SPEEDS)[number]);
      const from = index === -1 ? SPEEDS.indexOf(1) : index;
      const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + direction))];
      if (next !== undefined) setSpeed(next);
    },
    [prefs.playbackRate, setSpeed],
  );

  /* ------------------------------------------------------------------ idle */

  // Hiding the chrome is a class on one element, so the pointer can move
  // across the picture without React hearing about it at all.
  const setIdle = useCallback((idle: boolean) => {
    containerRef.current?.classList.toggle("stage-idle", idle);
  }, []);

  /**
   * The stage takes the film's own shape.
   *
   * A fixed 16:9 box has to put the difference somewhere, and that somewhere is
   * a band down the sides of anything wider — which is most films. Reading the
   * intrinsic size means the picture meets every edge of the stage, so there is
   * no band to colour in, and a 2.39:1 film is short enough that the whole
   * player clears the fold on its own.
   */
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const apply = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      container.style.setProperty(
        "--stage-ratio",
        `${video.videoWidth} / ${video.videoHeight}`,
      );
    };
    apply();
    // `resize` is the one that fires when a rendition swap changes the frame
    // size mid-playback; `loadedmetadata` covers the first read.
    video.addEventListener("loadedmetadata", apply);
    video.addEventListener("resize", apply);
    return () => {
      video.removeEventListener("loadedmetadata", apply);
      video.removeEventListener("resize", apply);
    };
  }, [videoRef]);

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    if (!playingRef.current || heldAwakeRef.current) return;
    idleTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_DELAY_MS);
  }, [setIdle]);

  const wake = useCallback(() => {
    setIdle(false);
    scheduleIdle();
  }, [scheduleIdle, setIdle]);

  // Playback starting is enough to begin the countdown; the pointer does not
  // have to move first. Pausing brings the chrome back and keeps it up.
  useEffect(() => {
    playingRef.current = state.playing;
    if (!state.playing) setIdle(false);
    scheduleIdle();
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [scheduleIdle, setIdle, state.playing]);

  const holdAwake = useCallback(
    (held: boolean) => {
      heldAwakeRef.current = held;
      if (held) setIdle(false);
      scheduleIdle();
    },
    [scheduleIdle, setIdle],
  );

  /* -------------------------------------------------------------- captions */

  /**
   * Which track is showing follows from the remembered language rather than
   * being held separately.
   *
   * Picking a language once should pick it for the series, not for the
   * episode, and the index of a language changes with every track list while
   * the language itself does not. Deriving it means an episode change simply
   * finds the same language in the new list, with nothing to keep in step.
   */
  const caption = useMemo(() => {
    if (!prefs.captionLanguage) return CAPTIONS_OFF;
    return (
      captions.find((choice) => choice.language === prefs.captionLanguage)
        ?.value ?? CAPTIONS_OFF
    );
  }, [captions, prefs.captionLanguage]);

  const captionIndex = caption === CAPTIONS_OFF ? null : Number(caption);
  useCaptions(videoRef, cuesRef, captionIndex, trackKey);

  const changeCaption = useCallback(
    (value: string) => {
      const choice = captions.find((entry) => entry.value === value);
      update({ captionLanguage: choice ? choice.language : null });
    },
    [captions, update],
  );

  const toggleCaptions = useCallback(() => {
    if (captions.length === 0) return;
    if (caption !== CAPTIONS_OFF) {
      changeCaption(CAPTIONS_OFF);
      showFlash("Subtitles off");
      return;
    }
    const first = captions[0];
    if (!first) return;
    changeCaption(first.value);
    showFlash(first.label);
  }, [caption, captions, changeCaption, showFlash]);

  /* -------------------------------------------------------------- chapters */

  // Entering and leaving a chapter happens a handful of times an episode, so
  // this one is allowed to be state — it has a label to render.
  useEffect(
    () =>
      // The subscription answers immediately, so an empty chapter list clears
      // the offer on the same tick it arrives.
      subscribeTime(({ currentTime }) => {
        const inside =
          chapters.find(
            (chapter) =>
              chapter.skippable &&
              currentTime >= chapter.start &&
              currentTime < chapter.end - 1,
          ) ?? null;
        setSkippable((current) =>
          current?.start === inside?.start ? current : inside,
        );
      }),
    [chapters, subscribeTime],
  );

  useEffect(() => {
    skipRef.current?.classList.toggle("stage-skip-visible", Boolean(skippable));
  }, [skippable]);

  /* -------------------------------------------------------------- keyboard */

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Let the browser own typing and tabbing.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.isContentEditable) return;

    const key = event.key;
    const handlers: Record<string, () => void> = {
      " ": () => {
        togglePlay();
        showFlash(state.playing ? "Paused" : "Playing");
      },
      k: () => {
        togglePlay();
        showFlash(state.playing ? "Paused" : "Playing");
      },
      ArrowLeft: () => {
        seekBy(-5);
        showFlash("−5s");
      },
      ArrowRight: () => {
        seekBy(5);
        showFlash("+5s");
      },
      j: () => {
        seekBy(-10);
        showFlash("−10s");
      },
      l: () => {
        seekBy(10);
        showFlash("+10s");
      },
      ArrowUp: () => {
        nudgeVolume(0.1);
        showFlash(`Volume ${Math.round(Math.min(1, state.volume + 0.1) * 100)}%`);
      },
      ArrowDown: () => {
        nudgeVolume(-0.1);
        showFlash(`Volume ${Math.round(Math.max(0, state.volume - 0.1) * 100)}%`);
      },
      m: () => {
        toggleMute();
        showFlash(state.muted ? "Sound on" : "Muted");
      },
      c: toggleCaptions,
      f: () => toggleFullscreen(),
      n: () => onNextEpisode?.(),
      e: () => onEpisodesOpenChange?.(!episodesOpen),
      "<": () => nudgeSpeed(-1),
      ",": () => nudgeSpeed(-1),
      ">": () => nudgeSpeed(1),
      ".": () => nudgeSpeed(1),
      "?": () => setShortcutsOpen((open) => !open),
      Escape: () => setShortcutsOpen(false),
      Home: () => seekTo(0),
      End: () => seekTo(state.duration),
    };

    const handler =
      handlers[key] ??
      (/^[0-9]$/.test(key) && state.duration > 0
        ? () => {
            seekTo(state.duration * (Number(key) / 10));
            showFlash(`${Number(key) * 10}%`);
          }
        : undefined);

    if (!handler) return;
    event.preventDefault();
    wake();
    handler();
  };

  /* ------------------------------------------------------------ tap to seek */

  const handleVideoClick = (event: React.MouseEvent<HTMLVideoElement>) => {
    if (status !== "ready") return;

    if (!coarsePointer) {
      togglePlay();
      return;
    }

    // On a touch screen the picture is not a play button — it is where the
    // controls live. A second tap in the same place is the seek.
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const now = Date.now();
    const last = lastTapRef.current;
    const sameSide = Math.abs(x - last.x) < rect.width / 4;

    if (now - last.at < DOUBLE_TAP_MS && sameSide) {
      lastTapRef.current = { at: 0, x: 0 };
      if (x < rect.width * 0.4) {
        seekBy(-10);
        showFlash("−10s");
      } else if (x > rect.width * 0.6) {
        seekBy(10);
        showFlash("+10s");
      } else {
        togglePlay();
      }
      return;
    }

    lastTapRef.current = { at: now, x };
    if (containerRef.current?.classList.contains("stage-idle")) wake();
    else setIdle(true);
  };

  /* -------------------------------------------------------------- settings */

  const settingsSections = useMemo<SettingsSection[]>(() => {
    const sections: SettingsSection[] = [];

    if (quality && quality.options.length > 1) {
      sections.push({
        id: "quality",
        title: "Quality",
        options: quality.options,
        value: quality.value,
        onChange: quality.onChange,
      });
    }

    sections.push({
      id: "speed",
      title: "Speed",
      options: SPEEDS.map((rate) => ({
        value: String(rate),
        label: rate === 1 ? "Normal" : `${rate}×`,
      })),
      value: String(prefs.playbackRate),
      onChange: (value) => setSpeed(Number(value)),
    });

    if (captions.length > 0) {
      sections.push({
        id: "subtitles",
        title: "Subtitles",
        options: [{ value: CAPTIONS_OFF, label: "Off" }, ...captions],
        value: caption,
        onChange: changeCaption,
      });
      sections.push({
        id: "text",
        title: "Style",
        options: [
          ...(["small", "medium", "large"] as CaptionSize[]).map((size) => ({
            value: `size:${size}`,
            label: size[0]!.toUpperCase() + size.slice(1),
            detail: size === prefs.captionSize ? "Current size" : undefined,
          })),
          {
            value: "backdrop",
            label: "Backdrop",
            detail: prefs.captionBackdrop
              ? "On — easier over bright footage"
              : "Off — a shadow instead",
          },
        ],
        value: `size:${prefs.captionSize}`,
        onChange: (value) => {
          if (value === "backdrop") {
            update({ captionBackdrop: !prefs.captionBackdrop });
            return;
          }
          update({ captionSize: value.slice(5) as CaptionSize });
        },
      });
    }

    if (sources && sources.options.length > 0) {
      sections.push({
        id: "source",
        title: "Source",
        // The tab already says Source. What it does not say is that choosing
        // one keeps it, which is the part nobody would guess.
        note: "Choosing a source keeps it. Automatic races all of them.",
        options: sources.options,
        value: sources.value,
        onChange: sources.onChange,
      });
    }

    return sections;
  }, [
    caption,
    captions,
    changeCaption,
    prefs.captionBackdrop,
    prefs.captionSize,
    prefs.playbackRate,
    quality,
    setSpeed,
    sources,
    update,
  ]);

  const showPoster = Boolean(poster) && status !== "ready";
  const VolumeIcon =
    state.muted || state.volume === 0
      ? IconVolumeOff
      : state.volume < 0.5
        ? IconVolume2
        : IconVolume;
  const captionsOn = caption !== CAPTIONS_OFF;
  const CaptionIcon = captionsOn ? IconBadgeCcFilled : IconBadgeCc;

  return (
    <div
      ref={containerRef}
      className="stage w-full overflow-hidden outline-none"
      tabIndex={0}
      role="region"
      aria-label={`${title} player`}
      onKeyDown={handleKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => playingRef.current && setIdle(true)}
    >
      {showPoster && (
        <Artwork
          src={poster}
          sizes="(min-width: 1024px) 80vw, 100vw"
          priority
          className="opacity-45"
        />
      )}
      {status !== "ready" && (
        <div
          className="absolute inset-0 bg-gradient-to-t from-stage via-stage/45 to-stage/70"
          aria-hidden="true"
        />
      )}

      <video
        ref={videoRef}
        playsInline
        crossOrigin="anonymous"
        className="absolute inset-0"
        onClick={handleVideoClick}
        onDoubleClick={() => !coarsePointer && toggleFullscreen()}
        onEnded={() => {
          setEndedKey(trackKey);
          onEnded?.();
        }}
      >
        {tracks}
      </video>

      {children}

      {/* Painted here rather than by the browser, so they can be sized and can
          move clear of the controls. */}
      <div
        ref={cuesRef}
        aria-live="polite"
        className={`stage-cues ${CUE_SIZE_CLASS[prefs.captionSize]} ${
          prefs.captionBackdrop ? "stage-cues-backdrop" : ""
        }`}
      />

      {/* Only in fullscreen. In the page the site header is already sitting
          over the top of the picture and the title is right underneath it, so
          a second band saying the same thing is two things doing one job. */}
      {status === "ready" && state.fullscreen && (
        <div className="stage-top">
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Leave fullscreen"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stage-text/85 transition-colors hover:bg-white/12 hover:text-stage-text"
          >
            <IconArrowLeft size={18} stroke={2} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-extrabold text-stage-text">
              {title}
            </p>
            {subtitle && (
              <p className="mt-0.5 truncate text-[11.5px] text-stage-muted">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* The centre affordance is whatever the stage needs next: start, retry,
          or nothing at all once a source is attached. */}
      {(status === "idle" || status === "error") && (
        <div className="stage-center">
          <button
            type="button"
            disabled={!canRequestPlayback}
            onClick={onRequestPlayback}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-phantom text-white shadow-[0_10px_36px_rgba(0,0,0,0.45)] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:bg-stage-raised disabled:text-stage-muted"
          >
            {status === "error" ? (
              <IconRefresh size={26} stroke={2.2} />
            ) : (
              <IconPlayerPlayFilled size={26} />
            )}
          </button>
          <p className="max-w-sm text-[13px] font-bold text-stage-text">
            {requestLabel}
          </p>
          {status === "error" && (
            <p className="max-w-md text-[11px] leading-5 text-stage-muted">
              {statusText}
            </p>
          )}
        </div>
      )}

      {status === "working" && (
        <div className="stage-center">
          <span className="stage-spinner h-8 w-8 sm:h-9 sm:w-9" />
          <p className="max-w-sm text-[12px] font-bold text-stage-text sm:text-[13px]">
            {statusText}
          </p>
          {progress && <RaceProgress model={progress} />}
        </div>
      )}

      {status === "ready" && state.waiting && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="stage-spinner h-9 w-9" />
        </div>
      )}

      {flash && (
        <span
          key={flash.id}
          className="stage-flash pointer-events-none absolute left-1/2 top-1/2 z-[3] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/70 px-4 py-2 font-mono text-sm font-bold text-stage-text"
        >
          {flash.text}
        </span>
      )}

      {toast && status === "ready" && (
        <div className="stage-toast">
          <span className="min-w-0 flex-1 truncate">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="shrink-0 rounded-md px-2 py-1 font-bold text-phantom-light transition-colors hover:bg-white/10"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismissToast}
            aria-label="Dismiss"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-stage-muted transition-colors hover:bg-white/10 hover:text-stage-text"
          >
            <IconX size={13} stroke={2.2} />
          </button>
        </div>
      )}

      {chapters.length > 0 && (
        <button
          ref={skipRef}
          type="button"
          className="stage-skip"
          onClick={() => {
            if (skippable) seekTo(skippable.end);
            wake();
          }}
        >
          Skip {skippable?.label ?? ""}
          <IconChevronRight size={15} stroke={2.4} />
        </button>
      )}

      {upNext && (
        <UpNext
          episode={upNext.episode}
          subscribe={subscribeTime}
          onPlay={upNext.onPlay}
          autoAdvance={endedKey === trackKey}
        />
      )}

      {episodesOpen && episodePanel}

      {shortcutsOpen && (
        <div className="stage-shortcuts" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-md">
            <p className="eyebrow text-stage-muted">Keyboard</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
              {SHORTCUTS.map(([keys, meaning]) => (
                <div key={keys} className="contents">
                  <dt className="whitespace-nowrap font-mono text-[11px] text-stage-text">
                    {keys}
                  </dt>
                  <dd className="text-[12px] text-stage-muted">{meaning}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      <div className="stage-chrome">
        <ScrubBar
          subscribe={subscribeTime}
          onSeek={seekTo}
          onScrubbingChange={holdAwake}
        />

        <div className="mt-1 flex items-center gap-0.5 sm:gap-1">
          <StageButton
            label={state.playing ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {state.playing ? (
              <IconPlayerPauseFilled size={19} />
            ) : (
              <IconPlayerPlayFilled size={19} />
            )}
          </StageButton>
          {onNextEpisode && (
            <StageButton label="Next episode" onClick={onNextEpisode}>
              <IconPlayerTrackNextFilled size={17} />
            </StageButton>
          )}
          <StageButton
            label="Back 10 seconds"
            onClick={() => seekBy(-10)}
            className="hidden sm:flex"
          >
            <IconRewindBackward10 size={19} stroke={1.9} />
          </StageButton>
          <StageButton
            label="Forward 10 seconds"
            onClick={() => seekBy(10)}
            className="hidden sm:flex"
          >
            <IconRewindForward10 size={19} stroke={1.9} />
          </StageButton>

          <div className="stage-volume-group">
            <StageButton
              label={state.muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
            >
              <VolumeIcon size={19} stroke={1.9} />
            </StageButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.muted ? 0 : state.volume}
              aria-label="Volume"
              onChange={(event) => setVolume(Number(event.target.value))}
              className="stage-volume"
              style={{
                ["--level" as string]: `${(state.muted ? 0 : state.volume) * 100}%`,
              }}
            />
          </div>

          <Timecode subscribe={subscribeTime} />

          <div className="ml-auto flex items-center gap-0.5">
            {captions.length > 0 && (
              <StageButton
                label={captionsOn ? "Turn subtitles off" : "Turn subtitles on"}
                onClick={toggleCaptions}
                className={captionsOn ? "flex text-phantom-light" : "flex"}
              >
                <CaptionIcon size={19} stroke={1.9} />
              </StageButton>
            )}
            {episodePanel && (
              <StageButton
                label="Episodes"
                onClick={() => onEpisodesOpenChange?.(!episodesOpen)}
              >
                <IconLayoutList size={19} stroke={1.9} />
              </StageButton>
            )}
            <StageSettings
              sections={settingsSections}
              onOpenChange={holdAwake}
            >
              {quality?.summary && (
                <span className="hidden font-mono text-[10.5px] text-stage-muted sm:inline">
                  {quality.summary}
                </span>
              )}
            </StageSettings>
            {!coarsePointer && (
              <StageButton
                label="Keyboard shortcuts"
                onClick={() => setShortcutsOpen((open) => !open)}
                className="hidden lg:flex"
              >
                <IconKeyboard size={19} stroke={1.9} />
              </StageButton>
            )}
            {canPictureInPicture && (
              <StageButton
                label="Picture in picture"
                onClick={togglePictureInPicture}
                className="hidden sm:flex"
              >
                <IconPictureInPicture size={19} stroke={1.9} />
              </StageButton>
            )}
            <StageButton
              label={state.fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              {state.fullscreen ? (
                <IconMinimize size={19} stroke={1.9} />
              ) : (
                <IconMaximize size={19} stroke={1.9} />
              )}
            </StageButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Subscribes to the playhead directly and writes it to the DOM. Rendering the
 * timecode through React would drag the whole chrome along with it once a
 * second.
 */
function Timecode({
  subscribe,
}: {
  subscribe: (listener: TimeListener) => () => void;
}) {
  const currentRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      subscribe(({ currentTime, duration }) => {
        if (currentRef.current) {
          currentRef.current.textContent = formatTimecode(currentTime);
        }
        if (totalRef.current) {
          totalRef.current.textContent = formatTimecode(duration);
        }
      }),
    [subscribe],
  );

  return (
    // `shrink-0` and no wrapping: this is the one item in the row with no fixed
    // width, so it is the one that folds in half when the row runs out of
    // space — which put the elapsed time above the buttons and the runtime
    // below them.
    <p className="ml-1 shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-stage-muted">
      <span ref={currentRef} className="text-stage-text">
        0:00
      </span>
      {" / "}
      <span ref={totalRef}>0:00</span>
    </p>
  );
}

function StageButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stage-text/85 transition-colors hover:bg-white/12 hover:text-stage-text sm:h-9 sm:w-9 ${
        className || "flex"
      }`}
    >
      {children}
    </button>
  );
}
