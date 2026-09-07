"use client";

import { MotionPresence } from "@/components/motion-presence";

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
import Link from "next/link";
import {
  IconArrowLeft,
  IconBadgeCc,
  IconChevronRight,
  IconKeyboard,
  IconLayoutList,
  IconMaximize,
  IconMinimize,
  IconPictureInPicture,
  IconPlayerTrackNext,
  IconPlayerPause,
  IconPlayerPlay,
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
import type { RaceProgressModel } from "./race-progress";
import { ScrubBar } from "./scrub-bar";
import {
  StageSettings,
  type SettingsSection,
  type SignalStrength,
} from "./stage-settings";
import { UpNext } from "./up-next";
import { useCaptions } from "./use-captions";
import type { Chapter } from "./use-chapters";
import { useVideoState, type TimeListener } from "./use-video-state";

export type StageStatus = "idle" | "working" | "ready" | "error";

export interface StageMenuModel {
  options: readonly {
    value: string;
    label: string;
    detail?: string;
    language?: string;
    signal?: SignalStrength;
  }[];
  value: string | null;
  onChange: (value: string) => void;
  summary?: string;
}

export interface CaptionChoice {
  value: string;
  label: string;
  detail?: string;
  language: string;
}

export interface StageToast {
  text: string;
  action?: { label: string; onClick: () => void };
}

interface VideoStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  title: string;
  subtitle?: string;
  poster?: string | null;
  status: StageStatus;
  statusText: string;
  onRequestPlayback: () => void;
  canRequestPlayback: boolean;
  requestLabel: string;
  progress?: RaceProgressModel;
  quality?: StageMenuModel;
  language?: StageMenuModel;
  audio?: StageMenuModel;
  sources?: StageMenuModel;
  captions?: readonly CaptionChoice[];
  tracks?: ReactNode;
  trackKey?: string;
  toast?: StageToast | null;
  onDismissToast?: () => void;
  onNextEpisode?: () => void;
  onEnded?: () => void;
  episodePanel?: ReactNode;
  episodesOpen?: boolean;
  onEpisodesOpenChange?: (open: boolean) => void;
  chapters?: readonly Chapter[];
  upNext?: { episode: EpisodeSummary; onPlay: () => void };
  children?: ReactNode;
}

const CAPTIONS_OFF = "off";
const STAGE_SHORT_HEIGHT = 420;
const IDLE_DELAY_MS = 2600;
const DOUBLE_TAP_MS = 320;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const PAGE_LEVEL_KEYS: ReadonlySet<string> = new Set([
  " ",
  "k",
  "j",
  "l",
  "m",
  "f",
  "c",
  "ArrowLeft",
  "ArrowRight",
  "?",
  "Escape",
]);

interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
}

const CUE_SIZE_CLASS: Record<CaptionSize, string> = {
  small: "stage-cues-sm",
  medium: "stage-cues-md",
  large: "stage-cues-lg",
};

const NEVER_CHANGES = () => () => {};
const pipSupported = () => document.pictureInPictureEnabled;
const saysNoOnServer = () => false;

const COARSE_QUERY = "(pointer: coarse)";
function subscribeToPointer(listener: () => void) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const isCoarsePointer = () => window.matchMedia(COARSE_QUERY).matches;

const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ["Space or K", "Play or pause"],
  ["Left or right arrow", "Back or forward 5 seconds"],
  ["J or L", "Back or forward 10 seconds"],
  ["Up or down arrow", "Volume"],
  ["M", "Mute"],
  ["C", "Subtitles on or off"],
  ["F", "Fullscreen"],
  ["N", "Next episode"],
  ["E", "Episodes"],
  ["Comma or period", "Slower or faster"],
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
  quality,
  language,
  audio,
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
  const awakeReasonsRef = useRef(new Set<string>());
  const lastTapRef = useRef({ at: 0, x: 0 });

  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  const [skippable, setSkippable] = useState<Chapter | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<"playback" | "language" | null>(null);
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

  const update = useCallback((next: Partial<PlayerPrefs>) => {
    savePrefs(next);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = prefs.playbackRate;
  }, [prefs.playbackRate, videoRef]);

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
      const index = SPEEDS.indexOf(
        prefs.playbackRate as (typeof SPEEDS)[number],
      );
      const from = index === -1 ? SPEEDS.indexOf(1) : index;
      const next =
        SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + direction))];
      if (next !== undefined) setSpeed(next);
    },
    [prefs.playbackRate, setSpeed],
  );

  const setIdle = useCallback((idle: boolean) => {
    containerRef.current?.classList.toggle("stage-idle", idle);
  }, []);

  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    if (!playingRef.current || heldAwakeRef.current) return;
    idleTimerRef.current = window.setTimeout(
      () => setIdle(true),
      IDLE_DELAY_MS,
    );
  }, [setIdle]);

  const wake = useCallback(() => {
    setIdle(false);
    scheduleIdle();
  }, [scheduleIdle, setIdle]);

  useEffect(() => {
    playingRef.current = state.playing;
    if (!state.playing) setIdle(false);
    scheduleIdle();
    return () => {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [scheduleIdle, setIdle, state.playing]);

  const holdAwake = useCallback(
    (held: boolean, reason = "settings") => {
      if (held) awakeReasonsRef.current.add(reason);
      else awakeReasonsRef.current.delete(reason);
      heldAwakeRef.current = awakeReasonsRef.current.size > 0;
      if (held) setIdle(false);
      scheduleIdle();
    },
    [scheduleIdle, setIdle],
  );

  useEffect(() => {
    holdAwake(episodesOpen, "episodes");
  }, [episodesOpen, holdAwake]);

  useEffect(() => {
    const stage = containerRef.current;
    if (!stage) return;
    const measure = () =>
      stage.classList.toggle(
        "stage-short",
        stage.clientHeight < STAGE_SHORT_HEIGHT,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    holdAwake(shortcutsOpen, "shortcuts");
  }, [holdAwake, shortcutsOpen]);

  useEffect(() => {
    holdAwake(settingsPanel !== null, "settings");
  }, [settingsPanel, holdAwake]);

  const changeSettingsPanel = (panel: "playback" | "language", open: boolean) => {
    setSettingsPanel(open ? panel : null);
    if (open) {
      onEpisodesOpenChange?.(false);
      setShortcutsOpen(false);
    }
  };

  const toggleEpisodes = useCallback(
    () => {
      setSettingsPanel(null);
      setShortcutsOpen(false);
      onEpisodesOpenChange?.(!episodesOpen);
    },
    [episodesOpen, onEpisodesOpenChange],
  );

  // The stored preference is a language, which is all that can carry to the
  // next episode: the tracks themselves are a different set every time. Which
  // of a language's tracks is playing is a decision about this sitting.
  const [picked, setPicked] = useState<{ key: string; value: string } | null>(
    null,
  );
  const pickedCaption = picked?.key === trackKey ? picked.value : null;

  const caption = useMemo(() => {
    if (pickedCaption === CAPTIONS_OFF) return CAPTIONS_OFF;
    if (pickedCaption && captions.some((c) => c.value === pickedCaption)) {
      return pickedCaption;
    }
    if (!prefs.captionLanguage) return CAPTIONS_OFF;
    return (
      captions.find((choice) => choice.language === prefs.captionLanguage)
        ?.value ?? CAPTIONS_OFF
    );
  }, [captions, pickedCaption, prefs.captionLanguage]);

  const captionIndex = caption === CAPTIONS_OFF ? null : Number(caption);
  useCaptions(videoRef, cuesRef, captionIndex, trackKey);

  const changeCaption = useCallback(
    (value: string) => {
      const choice = captions.find((entry) => entry.value === value);
      setPicked({ key: trackKey, value });
      update({ captionLanguage: choice ? choice.language : null });
    },
    [captions, trackKey, update],
  );

  // One row per language rather than six rows reading "English": the tracks
  // behind a language differ only in who typed them, which is nothing to
  // choose from until you have heard one that does not fit.
  const captionGroups = useMemo(() => {
    const groups = new Map<string, CaptionChoice[]>();
    captions.forEach((choice) => {
      const group = groups.get(choice.label);
      if (group) group.push(choice);
      else groups.set(choice.label, [choice]);
    });
    return [...groups.entries()].map(([label, choices]) => ({
      label,
      choices,
    }));
  }, [captions]);

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

  const changeAudio = useCallback(
    (value: string) => {
      if (!audio) return;
      const choice = audio.options.find((entry) => entry.value === value);
      if (choice?.language) update({ audioLanguage: choice.language });
      audio.onChange(value);
      if (choice) showFlash(choice.label);
    },
    [audio, showFlash, update],
  );

  useEffect(() => {
    if (!audio || !prefs.audioLanguage) return;
    const preferred = audio.options.find(
      (choice) => choice.language === prefs.audioLanguage,
    );
    if (preferred && preferred.value !== audio.value) {
      audio.onChange(preferred.value);
    }
  }, [audio, prefs.audioLanguage]);

  useEffect(
    () =>
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

  const handleKeyDown = (event: ShortcutEvent, fromPage = false) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest("input, textarea, select, button, a, [role=dialog]") ||
      target?.isContentEditable
    )
      return;

    const key = event.key;
    if (fromPage && (status !== "ready" || !PAGE_LEVEL_KEYS.has(key))) return;
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
        showFlash(
          `Volume ${Math.round(Math.min(1, state.volume + 0.1) * 100)}%`,
        );
      },
      ArrowDown: () => {
        nudgeVolume(-0.1);
        showFlash(
          `Volume ${Math.round(Math.max(0, state.volume - 0.1) * 100)}%`,
        );
      },
      m: () => {
        toggleMute();
        showFlash(state.muted ? "Sound on" : "Muted");
      },
      c: toggleCaptions,
      f: () => toggleFullscreen(),
      n: () => onNextEpisode?.(),
      e: toggleEpisodes,
      "<": () => nudgeSpeed(-1),
      ",": () => nudgeSpeed(-1),
      ">": () => nudgeSpeed(1),
      ".": () => nudgeSpeed(1),
      "?": () => setShortcutsOpen((open) => !open),
      Escape: () => {
        if (episodesOpen) {
          onEpisodesOpenChange?.(false);
          return;
        }
        setShortcutsOpen(false);
      },
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

  const shortcutRef = useRef(handleKeyDown);
  useEffect(() => {
    shortcutRef.current = handleKeyDown;
  });

  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active !== document.documentElement
      ) {
        return;
      }
      shortcutRef.current(event, true);
    };

    document.addEventListener("keydown", onDocumentKeyDown);
    return () => document.removeEventListener("keydown", onDocumentKeyDown);
  }, []);

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    // Touch emits pointerleave before click, so hiding here would swallow the tap.
    if (event.pointerType !== "mouse") return;
    if (playingRef.current && !heldAwakeRef.current) setIdle(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    wake();
  };

  const handleVideoClick = (event: React.MouseEvent<HTMLVideoElement>) => {
    if (status !== "ready") return;

    if (episodesOpen) {
      onEpisodesOpenChange?.(false);
      return;
    }

    if (!coarsePointer) {
      togglePlay();
      return;
    }

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
    if (
      !state.playing ||
      containerRef.current?.classList.contains("stage-idle")
    )
      wake();
    else if (!heldAwakeRef.current) setIdle(true);
  };

  const settingsSections = useMemo<SettingsSection[]>(() => {
    const sections: SettingsSection[] = [];

    if (language && language.options.length > 0) {
      sections.push({
        id: "language",
        title: "Audio",
        note: "Choose an available audio language. Some streams do not identify their language.",
        options: language.options,
        value: language.value,
        onChange: (value) => {
          language.onChange(value);
          const selected = language.options.find(
            (option) => option.value === value,
          );
          if (selected) showFlash(`${selected.label} audio`);
        },
      });
    }

    if (quality && quality.options.length > 0) {
      sections.push({
        id: "quality",
        title: "Quality",
        summary: quality.summary,
        options: quality.options,
        value: quality.value,
        onChange: quality.onChange,
      });
    }

    if (audio && audio.options.length > 1) {
      sections.push({
        id: "audio",
        title: language?.options.length ? "Audio track" : "Audio",
        options: audio.options,
        value: audio.value,
        onChange: changeAudio,
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
        options: [
          { value: CAPTIONS_OFF, label: "Off" },
          ...captionGroups.map(({ label, choices }) => {
            const active = choices.findIndex(
              (choice) => choice.value === caption,
            );
            const showing = choices[active] ?? choices[0]!;
            return {
              value: showing.value,
              label,
              detail:
                active >= 0
                  ? showing.detail
                  : (showing.detail ??
                    (choices.length > 1
                      ? `${choices.length} versions`
                      : undefined)),
              variant:
                active >= 0 && choices.length > 1
                  ? {
                      index: active,
                      count: choices.length,
                      onStep: (direction: 1 | -1) => {
                        const next =
                          (active + direction + choices.length) %
                          choices.length;
                        changeCaption(choices[next]!.value);
                      },
                    }
                  : undefined,
            };
          }),
        ],
        value: caption,
        onChange: changeCaption,
      });
      sections.push({
        id: "text",
        title: "Subtitle appearance",
        summary: prefs.captionSize[0]!.toUpperCase() + prefs.captionSize.slice(1),
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
              ? "On for easier reading over bright footage"
              : "Off with a shadow instead",
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
        note: "Automatic is recommended. Change this only to troubleshoot playback.",
        options: sources.options,
        value: sources.value,
        onChange: sources.onChange,
      });
    }

    return sections;
  }, [
    audio,
    caption,
    captionGroups,
    captions,
    changeAudio,
    changeCaption,
    prefs.captionBackdrop,
    prefs.captionSize,
    prefs.playbackRate,
    language,
    quality,
    setSpeed,
    showFlash,
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
  const languageSections = settingsSections.filter((section) =>
    ["language", "audio", "subtitles", "text"].includes(section.id),
  );
  const playbackSections = settingsSections.filter((section) =>
    ["quality", "speed", "source"].includes(section.id),
  );

  return (
    <div
      ref={containerRef}
      className="stage w-full overflow-hidden"
      tabIndex={0}
      role="region"
      aria-label={`${title} player`}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {showPoster && (
        <Artwork
          src={poster}
          sizes="(min-width: 1024px) 80vw, 100vw"
          priority
          className="stage-poster"
        />
      )}
      {status !== "ready" && (
        <div
          className="absolute inset-0 bg-gradient-to-t from-stage via-stage/35 to-stage/60"
          aria-hidden="true"
        />
      )}

      <video
        ref={videoRef}
        playsInline
        crossOrigin="anonymous"
        className={`absolute inset-0 ${status !== "ready" ? "stage-video-pending" : ""}`}
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

      <div
        ref={cuesRef}
        aria-live="polite"
        className={`stage-cues ${CUE_SIZE_CLASS[prefs.captionSize]} ${
          prefs.captionBackdrop ? "stage-cues-backdrop" : ""
        }`}
      />

      <div className="stage-top">
        {state.fullscreen ? (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Leave fullscreen"
            className="stage-control"
          >
            <IconArrowLeft size={20} stroke={1.5} />
          </button>
        ) : (
          <Link href="/" aria-label="Back to browse" className="stage-control">
            <IconArrowLeft size={20} stroke={1.5} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-medium tracking-tight text-stage-text">
            {title}
          </p>
          {subtitle && (
            <p className="mt-1 truncate text-[13px] text-stage-muted">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {(status === "idle" || status === "error") && (
        <div className="stage-center">
          <button
            type="button"
            disabled={!canRequestPlayback}
            onClick={onRequestPlayback}
            className="stage-play"
          >
            {status === "error" ? (
              <IconRefresh size={26} stroke={2.2} />
            ) : (
              <IconPlayerPlay size={24} stroke={1.3} />
            )}
            {requestLabel}
          </button>
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
          <p className="max-w-sm text-sm font-medium text-stage-text">
            {statusText}
          </p>
        </div>
      )}

      {status === "ready" && state.waiting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="stage-spinner h-9 w-9" />
        </div>
      )}

      {status === "ready" && !state.waiting && (
        <div className="stage-transport">
          <div className="stage-transport-controls">
            <StageButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
              <IconRewindBackward10 size={30} stroke={1.6} />
            </StageButton>
            <StageButton
              label={state.playing ? "Pause" : "Play"}
              className="stage-transport-play"
              onClick={togglePlay}
            >
              {state.playing ? (
                <IconPlayerPause size={46} stroke={1.6} />
              ) : (
                <IconPlayerPlay size={46} stroke={1.6} />
              )}
            </StageButton>
            <StageButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
              <IconRewindForward10 size={30} stroke={1.6} />
            </StageButton>
          </div>
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

      <MotionPresence open={episodesOpen}>{episodePanel}</MotionPresence>

      {shortcutsOpen && (
        <div
          className="stage-shortcuts"
          onClick={() => setShortcutsOpen(false)}
        >
          <div className="w-full max-w-md">
            <p className="text-sm font-medium text-stage-muted">Keyboard</p>
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
        {status === "ready" && (
          <ScrubBar
            subscribe={subscribeTime}
            onSeek={seekTo}
            onScrubbingChange={(held) => holdAwake(held, "scrubbing")}
          />
        )}

        <div className="stage-controls">
          <div className="stage-controls-left">
            {status === "ready" ? (
              <>
                <StageButton
                  label={state.playing ? "Pause" : "Play"}
                  onClick={togglePlay}
                  className="stage-toolbar-play"
                >
                  {state.playing ? (
                    <IconPlayerPause size={22} stroke={1.5} />
                  ) : (
                    <IconPlayerPlay size={22} stroke={1.5} />
                  )}
                </StageButton>
                {onNextEpisode && (
                  <StageButton label="Next episode" onClick={onNextEpisode}>
                    <IconPlayerTrackNext size={22} stroke={1.5} />
                  </StageButton>
                )}
                <div className="stage-volume-group">
                  <StageButton
                    label={state.muted ? "Unmute" : "Mute"}
                    onClick={toggleMute}
                  >
                    <VolumeIcon size={22} stroke={1.5} />
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
              </>
            ) : (
              <span className="stage-ready-label">{title}</span>
            )}
          </div>

          <div className="stage-controls-right">
            {episodePanel && (
              <StageButton
                label="Episodes"
                onClick={toggleEpisodes}
                expanded={episodesOpen}
                className={episodesOpen ? "stage-control-selected" : ""}
              >
                <IconLayoutList size={22} stroke={1.5} />
              </StageButton>
            )}
            <StageSettings
              label="Audio and subtitles"
              icon={<IconBadgeCc size={22} stroke={1.5} />}
              sections={languageSections}
              open={settingsPanel === "language"}
              onOpenChange={(open) => changeSettingsPanel("language", open)}
            />
            <StageSettings
              sections={playbackSections}
              open={settingsPanel === "playback"}
              onOpenChange={(open) => changeSettingsPanel("playback", open)}
              actions={[
                ...(status === "ready" && canPictureInPicture ? [{
                  label: "Picture in picture",
                  icon: <IconPictureInPicture size={20} stroke={1.5} />,
                  onClick: togglePictureInPicture,
                }] : []),
                ...(!coarsePointer ? [{
                  label: "Keyboard shortcuts",
                  icon: <IconKeyboard size={20} stroke={1.5} />,
                  onClick: () => setShortcutsOpen(true),
                }] : []),
              ]}
            />
            <StageButton
              label={state.fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              {state.fullscreen ? (
                <IconMinimize size={22} stroke={1.5} />
              ) : (
                <IconMaximize size={22} stroke={1.5} />
              )}
            </StageButton>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <p className="stage-timecode">
      <span ref={currentRef} className="text-stage-text">
        0:00
      </span>
      <span className="stage-duration">
        {" / "}
        <span ref={totalRef}>0:00</span>
      </span>
    </p>
  );
}

function StageButton({
  label,
  onClick,
  className = "",
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      className={`stage-control ${className}`}
    >
      {children}
    </button>
  );
}
