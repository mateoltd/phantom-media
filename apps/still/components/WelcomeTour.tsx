"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Broadcast, ChatCircle, DownloadSimple, Lock, LockOpen, ShareNetwork } from "@phosphor-icons/react/ssr";
import { ScrubBar, SearchField, type TimeListener, type TimeSnapshot } from "@phantom/ui";
import type { ChatMessage } from "@/lib/chat/messages";
import type { ChannelData } from "@/lib/contracts";
import type { SliceReceipt } from "@/lib/catalog/contracts";
import { setWelcomePhase } from "@/lib/welcome";
import { ChatPanel } from "./chat/ChatPanel";
import { Footer } from "./Footer";
import { Catalog } from "./library/Catalog";
import { PlayerControls } from "./player/chrome";
import { PlayerStage } from "./player/PlayerStage";
import { ChannelHeader } from "./watch/ChannelHeader";
import { VodInfo } from "./watch/VodInfo";
import { useWatchChat, WatchLayout } from "./watch/WatchLayout";
import { WatchRail } from "./watch/WatchRail";

/** The pitch: each feeling Twitch leaves you with, then what happens here instead. */
const LINES = [
  "Pick someone to watch. A name is all I need.",
  "We all know this feeling. It is just getting good, and then...",
  "...ads. Right at the best part.",
  "Not here. The stream never leaves the screen.",
  "Looked away and missed it? On Twitch it is gone.",
  "Here you drag back, even while it is live.",
  "One tap and you are live again.",
  "Got sent a video? Paste the link.",
  "Subscribers only. On Twitch, that is the end of it.",
  "I open those too, as long as Twitch still has the video.",
  "No account, and what you watch stays in this browser. Your turn.",
];
/** How long a line stays up before anything else may happen: time to find the bubble, then to read it. */
const read = (line: number) => 1100 + 60 * LINES[line].length;

const ARCHIVE = 2400;
const VOD = 11520;
const LINK = "twitch.tv/videos/2471180355";
const SEARCH_LABELS = { placeholder: "Channel, category or link", submit: "Open Twitch content", working: "Searching", suggestions: "Channels, categories and videos", looking: "Searching Twitch…" };

interface Channel { login: string; name: string; game: string; title: string; art: string | null }
interface Scene {
  line: number;
  /** The bubble is open. It closes when the mascot changes sides or pages. */
  speaking: boolean;
  view: "search" | "player";
  query: string;
  suggesting: boolean;
  /** What covers the picture: Twitch's ad break, or its subscriber lock and the moment that gives way. */
  slate: "none" | "ad" | "locked" | "opening";
  /** The live stream is played from its growing archive, so it has a timeline from the start; then a past broadcast. */
  mode: "rewind" | "vod";
  playing: boolean;
  /** The ad break was just thrown out, and the picture says so. */
  blocked: boolean;
  /** Between two pages: the one on screen fades out before the next fades in. */
  fading: boolean;
  leaving: boolean;
}

const OPENING: Scene = { line: 0, speaking: false, view: "search", query: "", suggesting: false, slate: "none", mode: "rewind", playing: false, blocked: false, fading: false, leaving: false };
const STAND_IN: Channel = { login: "nightowl", name: "nightowl", game: "Just Chatting", title: "nightowl", art: null };
const QUALITY = [{ id: "quality", title: "Quality", options: [{ value: "auto", label: "Automatic" }], value: "auto", summary: "Automatic", onChange: () => {} }];
const SLEEP = { minutes: null, minutesLeft: 0, setMinutes: () => {} };
const CHATTERS = ["mossy_", "quietkay", "bitrate_bob", "lumen", "tako", "frame_drop", "sleepyjo", "nine_lives", "pixelpip", "owlbear"];
const CHATTER = ["no way", "that was clean", "LETS GO", "clip that", "wait what just happened", "first time here, hi", "ok that was actually good", "one more", "the timing lol", "gg", "how", "rewind that please", "W", "chat is this real"];
const CHAT_COLORS = ["#FF7F50", "#1E90FF", "#00FF7F", "#DAA520", "#FF69B4", "#9ACD32", "#8A2BE2"];
/** The channel's videos are never asked for: the catalog under the player stays on its own skeleton. */
const UNANSWERED = new Promise<SliceReceipt | null>(() => {});
const idle = () => {};
const finish = () => setWelcomePhase("done");
const sharp = (art: string) => art.replace("-640x360.", "-1280x720.");

/** The tour's cast is whoever leads the home feed right now, which is already on the page: no request is made for it. */
function feedChannels(): Channel[] | null {
  const cast = Array.from(document.querySelectorAll<HTMLAnchorElement>('[aria-labelledby="home-feed-heading"] a.still-home-tile')).slice(0, 2).flatMap((tile) => {
    const name = tile.querySelector(".still-home-tile-channel")?.textContent?.trim();
    if (!name) return [];
    return [{
      name,
      login: tile.getAttribute("href")?.replace(/^\//, "") || name.toLowerCase(),
      game: tile.querySelector(".still-home-tile-detail")?.textContent?.trim() ?? "",
      title: tile.title.split("\n")[0].trim() || name,
      art: tile.querySelector("img")?.getAttribute("src") ?? null,
    }];
  });
  return cast.length ? cast : null;
}

/** The picture, sharp enough for the frame, over the tile's copy that the browser already has. */
function picture(art: string | null) {
  return art ? { backgroundImage: `url(${JSON.stringify(sharp(art))}), url(${JSON.stringify(art)})` } : undefined;
}

/** What the channel's own header needs, from what the feed tile says. The tile's picture stands in for the portrait. */
function profile(channel: Channel): ChannelData | null {
  if (!channel.art) return null;
  return { id: channel.login, login: channel.login, displayName: channel.name, description: "", profileImageURL: channel.art,
    stream: { id: channel.login, title: channel.title, type: "live", viewersCount: 0, createdAt: "", game: channel.game ? { name: channel.game } : null } };
}

function line(index: number, offset?: number): ChatMessage {
  return { id: String(index), user: CHATTERS[(index * 7) % CHATTERS.length], color: CHAT_COLORS[(index * 3) % CHAT_COLORS.length], text: CHATTER[(index * 5) % CHATTER.length], offset };
}

/** Stands in for a playing video's clock: the real controls follow it exactly as they follow a real one. */
function createClock() {
  let snapshot: TimeSnapshot = { currentTime: 0, duration: 0, bufferedTo: 0 };
  const listeners = new Set<TimeListener>();
  return {
    read: () => snapshot,
    set(currentTime: number, duration: number) {
      snapshot = { currentTime, duration, bufferedTo: duration };
      listeners.forEach((listener) => listener(snapshot));
    },
    watch(listener: TimeListener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    subscribe(listener: TimeListener) {
      listener(snapshot);
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
type Clock = ReturnType<typeof createClock>;

/** The real toolbar on the scripted clock. It alone follows the clock, so a dragged timeline redraws nothing else. */
function TourControls({ clock, live, title, playing, chatOpen }: { clock: Clock; live: boolean; title: string; playing: boolean; chatOpen: boolean }) {
  const lag = useSyncExternalStore(clock.watch, () => Math.round(clock.read().duration - clock.read().currentTime), () => 0);
  const elapsed = useSyncExternalStore(clock.watch, () => Math.floor(clock.read().currentTime), () => 0);
  return <PlayerControls
    ready
    title={title}
    playing={playing}
    muted={false}
    volume={1}
    fullscreen={false}
    onTogglePlay={idle}
    onToggleMute={idle}
    onVolumeChange={idle}
    onToggleFullscreen={idle}
    timeline={<ScrubBar subscribe={clock.subscribe} onSeek={idle} />}
    clock={{ live, rewindable: live, lag, behind: false, currentTime: elapsed, duration: VOD }}
    onSeekToLive={idle}
    sleep={SLEEP}
    menu={null}
    onMenuChange={idle}
    chatOpen={chatOpen}
    onChatToggle={idle}
    settings={QUALITY}
    actions={[]}
  />;
}

/** The real chat panel on scripted messages. It is already mid-conversation, and talks slowly: the mascot has the floor. */
function TourChat({ clock, live, playing, channel }: { clock: Clock; live: boolean; playing: boolean; channel: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => live ? Array.from({ length: 9 }, (_, index) => line(index)) : []);
  const sent = useRef(9);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = line(sent.current++, live ? undefined : Math.floor(clock.read().currentTime));
      setMessages((messages) => [...messages.slice(-30), next]);
    }, live ? 1300 : 1000);
    return () => clearInterval(timer);
  }, [playing, live, clock]);
  return <ChatPanel channel={channel} script={{ messages, replay: !live }} onClose={idle} />;
}

interface Spot {
  x: number;
  y: number;
  scale: number;
  /** How far the mascot's own things reach to its right (the header's wordmark), which the bubble must clear. */
  reach?: number;
  /** The least room a bubble beside the mascot may be given before it goes under it instead. */
  room?: number;
  /** The sides to try for the bubble, in order, where the usual order would lay it over what the mascot is working. */
  sides?: readonly Side[];
}
type Side = "right" | "left" | "below" | "above";
const SIDES: readonly Side[] = ["right", "left", "below", "above"];
/** The layer's and the mascot's sizes, read once per resize so that placing never has to ask the page. */
interface Frame { width: number; height: number; face: number }

const GAP = 14, EDGE = 12;

/** Which side of the mascot its bubble opens on there: beside it where the viewport has room, else under or over it. */
function sideFor(frame: Frame, { x, y, scale, reach, room = 220, sides = SIDES }: Spot): Side {
  const half = frame.face * scale / 2;
  const fits = (side: Side) => side === "right" ? frame.width - EDGE - (x + (reach ?? half) + GAP) >= room
    : side === "left" ? x - half - GAP - EDGE >= room
    : side === "below" ? y + half + GAP + 96 < frame.height : y - half - GAP - 96 > 0;
  return sides.find(fits) ?? (y > frame.height / 2 ? "above" : "below");
}

/** Puts the mascot on its spot and its bubble beside it, and reports where the bubble went. */
function arrange(frame: Frame, guide: HTMLElement, bubble: HTMLElement, spot: Spot) {
  const { x, y, scale, reach } = spot;
  guide.style.translate = `${x}px ${y}px`;
  guide.style.scale = String(scale);
  const half = frame.face * scale / 2, side = sideFor(frame, spot);
  const room = side === "right" ? frame.width - EDGE - (x + (reach ?? half) + GAP) : side === "left" ? x - half - GAP - EDGE : frame.width - 2 * EDGE;
  bubble.style.setProperty("--room", `${Math.min(352, room)}px`);
  const wide = bubble.offsetWidth, tall = bubble.offsetHeight;
  const within = (value: number, size: number, limit: number) => Math.max(EDGE, Math.min(value, limit - EDGE - size));
  // The face is drawn flatter than its box, so a bubble under or over it sits closer than one beside it.
  const bx = side === "right" ? x + (reach ?? half) + GAP : side === "left" ? x - half - GAP - wide : within(x - half, wide, frame.width);
  const by = side === "below" ? y + half * 0.72 + GAP : side === "above" ? y - half * 0.72 - GAP - tall : within(y - tall / 2, tall, frame.height);
  const tail = side === "right" || side === "left" ? y - by : x - bx;
  bubble.style.translate = `${bx}px ${by}px`;
  bubble.dataset.side = side;
  bubble.style.setProperty("--tail", `${tail}px`);
  return { x: bx, y: by };
}

/**
 * The welcome's second half: the mascot leaves the header, goes to each thing it talks about and works it itself.
 * A line is given the time it takes to read before anything else moves, and the bubble travels with the mascot, so
 * what is happening always has its words beside it. The search is typed where the home page's own field stands,
 * and the player is the real watch page (layout, rail, chat, toolbar, the channel under it), so every viewport
 * gets the page it would really get. Nothing here plays or asks Twitch for anything: the picture is a feed
 * thumbnail, and the clock and the chat are scripted. It ends by handing the home page back.
 *
 * It has to run well on a slow phone: everything that moves is a transform or an opacity, the clock and the chat
 * redraw only themselves, and a drag writes two styles a frame and reads none.
 */
export function WelcomeTour() {
  const [scene, setScene] = useState(OPENING);
  const [members, setMembers] = useState(feedChannels);
  const [clock] = useState(createClock);
  const watchChat = useWatchChat();
  const stage = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLParagraphElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const spot = useRef<Spot | null>(null);
  const frame = useRef<Frame>({ width: 0, height: 0, face: 0 });
  const star = members?.[0] ?? STAND_IN, locked = members?.[1] ?? star;
  const live = scene.mode !== "vod";

  // The scripted field stands exactly where the home page keeps its own, which steps aside (see still.css).
  useLayoutEffect(() => {
    const root = stage.current, cast = layer.current, mascot = guide.current;
    const field = document.querySelector(".still-home-search-field");
    if (!root || !cast || !mascot || !field) return;
    const place = () => {
      const box = field.getBoundingClientRect(), origin = root.getBoundingClientRect();
      root.style.setProperty("--search-left", `${box.left - origin.left}px`);
      root.style.setProperty("--search-top", `${box.top - origin.top}px`);
      root.style.setProperty("--search-width", `${box.width}px`);
      frame.current = { width: cast.clientWidth, height: cast.clientHeight, face: mascot.offsetWidth };
    };
    window.scrollTo(0, 0);
    place();
    const resized = new ResizeObserver(place);
    resized.observe(document.documentElement);
    // The page behind stays where it is, or the field would no longer be over its place: the document does not
    // scroll while this runs (see still.css), and a touch or a wheel is stopped wherever it lands.
    const hold = (event: Event) => event.preventDefault();
    window.addEventListener("wheel", hold, { passive: false });
    window.addEventListener("touchmove", hold, { passive: false });
    // Nor can it be reached: the keyboard stays with Skip until the page is handed back.
    const covered = Array.from(document.body.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child !== root && child !== cast && !child.inert);
    covered.forEach((child) => { child.inert = true; });
    return () => {
      resized.disconnect();
      window.removeEventListener("wheel", hold);
      window.removeEventListener("touchmove", hold);
      covered.forEach((child) => { child.inert = false; });
    };
  }, []);

  // A feed that is still loading is waited for, briefly: the tour's picture comes from it.
  useEffect(() => {
    if (members) return;
    const settle = () => setMembers(feedChannels() ?? [STAND_IN]);
    const feed = new MutationObserver(() => { if (feedChannels()) settle(); });
    feed.observe(document.querySelector(".still-home") ?? document.body, { childList: true, subtree: true });
    const late = setTimeout(settle, 3000);
    return () => { feed.disconnect(); clearTimeout(late); };
  }, [members]);

  // The page's own rules follow the tour by this (see still.css), which costs nothing to match.
  useLayoutEffect(() => {
    const page = document.documentElement.dataset;
    page.tour = scene.leaving ? "leaving" : scene.view;
    return () => { delete page.tour; };
  }, [scene.view, scene.leaving]);

  // The bubble is laid out again for every line, and whenever it opens somewhere new.
  useLayoutEffect(() => {
    if (guide.current && bubble.current && spot.current) arrange(frame.current, guide.current, bubble.current, spot.current);
  }, [scene.line, scene.speaking]);

  useEffect(() => {
    // Skip is the one thing here to work, so Tab has nowhere else to take the keyboard.
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      else if (event.key === "Tab") { event.preventDefault(); skip.current?.focus({ preventScroll: true }); }
    };
    window.addEventListener("keydown", keys);
    skip.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", keys);
  }, []);

  useEffect(() => {
    const root = stage.current, cast = layer.current, mascot = guide.current, speech = bubble.current;
    if (!root || !cast || !mascot || !speech) return;
    const control = new AbortController();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const patch = (next: Partial<Scene>) => setScene((scene) => ({ ...scene, ...next }));
    const stopped = (reject: (reason: unknown) => void, cancel: () => void) => control.signal.addEventListener("abort", () => { cancel(); reject(control.signal.reason); }, { once: true });
    const wait = (ms: number) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      stopped(reject, () => clearTimeout(timer));
    });
    const tween = (ms: number, step: (progress: number) => void) => new Promise<void>((resolve, reject) => {
      if (reduced) { step(1); resolve(); return; }
      const start = performance.now();
      let request = requestAnimationFrame(function next(now) {
        const progress = Math.min(1, (now - start) / ms);
        step(progress);
        if (progress < 1) request = requestAnimationFrame(next); else resolve();
      });
      stopped(reject, () => cancelAnimationFrame(request));
    });
    let open = false;
    let held = { x: 0, y: 0 };
    const put = (next: Spot) => { spot.current = next; held = arrange(frame.current, mascot, speech, next); };
    /** A point of something on screen, by how far across and down it is, or nothing if this viewport hides it. */
    const find = (selector: string, across = 0.5, down = 0.5): Spot | null => {
      const element = document.querySelector(selector);
      if (!element?.getClientRects().length) return null;
      const box = element.getBoundingClientRect(), origin = cast.getBoundingClientRect();
      return { x: box.left - origin.left + box.width * across, y: box.top - origin.top + box.height * down, scale: 1 };
    };
    /** At the end of a field or a row: a bubble to its left would lie over what is written there. */
    const beside = (spot: Spot | null): Spot | null => spot && { ...spot, sides: ["right", "below", "above"] };
    /**
     * The same for something on the watch page, which is brought into view first: a short window does not show
     * the whole page, so the page slides under its top edge (see still-tour-page) as far as the thing needs, and
     * the point is where the thing will be once it has.
     */
    let slid = 0;
    const aim = (selector: string, across = 0.5, down = 0.5, margin = 24): Spot | null => {
      const page = root.querySelector<HTMLElement>(".still-tour-page"), content = page?.firstElementChild;
      const element = root.querySelector(selector);
      if (!page || !(content instanceof HTMLElement) || !element?.getClientRects().length) return null;
      const box = element.getBoundingClientRect(), origin = cast.getBoundingClientRect(), area = page.getBoundingClientRect();
      // Something taller than the window is centred in it. Anything else moves only as far as it must.
      const wish = box.height + 2 * margin > area.height ? (box.top + box.bottom - area.top - area.bottom) / 2
        : box.bottom + margin > area.bottom ? box.bottom + margin - area.bottom
        : box.top - margin < area.top ? box.top - margin - area.top : 0;
      // The page has already been slid, which its scroll height no longer counts.
      const next = Math.max(0, Math.min(slid + wish, page.scrollHeight + slid - area.height));
      const moved = next - slid;
      slid = next;
      content.style.translate = `0 ${-next}px`;
      return { x: box.left - origin.left + box.width * across, y: box.top - origin.top + box.height * down - moved, scale: 1 };
    };
    /** Sitting on a control's upper edge, so that what it works stays in view under it. */
    const perch = (selector: string, across = 0.5): Spot | null => {
      const top = aim(selector, across, 0, 96);
      return top && { ...top, y: top.y - frame.current.face * 0.34, sides: ["above"] };
    };
    /** The header logo's face, which the mascot left and returns to: the same size, with the wordmark beside it. */
    const home = (): Spot | null => {
      const logo = find(".still-brand-logo", 0, 0.5);
      const box = document.querySelector(".still-brand-logo")?.getBoundingClientRect();
      if (!logo || !box) return null;
      return { x: logo.x + box.height / 2, y: logo.y, scale: box.height / frame.current.face, reach: box.width - box.height / 2 + 4, room: 440 };
    };
    /** Over the search field, where the home page's prompt was. */
    const greet = (): Spot | null => {
      const prompt = find(".still-home-prompt"), field = find(".still-home-search-field", 0);
      return prompt && field && { ...prompt, x: field.x + frame.current.face / 2 };
    };
    /**
     * Where it waits on the watch page: low on the picture, clear of the title and of what Twitch puts in the
     * middle, or, on smaller pages, in the band kept above the player for it.
     */
    const seat = (): Spot | null => {
      const page = find(".still-tour-page", 0, 0), player = find(".still-tour .stage-frame", 0, 0);
      if (page && player && window.matchMedia("(max-width: 900px)").matches) return { x: player.x + frame.current.face / 2, y: page.y - 56, scale: 1 };
      return aim(".still-tour-seat", 0.5, 0.5, 72);
    };
    const speak = async (speaking: boolean) => {
      if (open === speaking) return;
      open = speaking;
      patch({ speaking });
      if (!speaking) await wait(reduced ? 0 : 110);
    };
    /**
     * Travels, taking as long as the distance asks, and reports whether there was somewhere to go. With `along`
     * the bubble comes too: it glides beside the mascot, or closes and reopens if it has to change sides.
     */
    const go = async (next: Spot | null, along = false) => {
      if (!next) return false;
      const from = spot.current ?? next;
      const glides = along && open && sideFor(frame.current, next) === speech.dataset.side;
      if (!glides) await speak(false);
      const ms = reduced ? 0 : Math.round(Math.min(520, 240 + Math.hypot(next.x - from.x, next.y - from.y) * 0.4));
      cast.style.setProperty("--travel", `${ms}ms`);
      if (glides) speech.dataset.gliding = "";
      put(next);
      await wait(ms + 40);
      delete speech.dataset.gliding;
      if (along) await speak(true);
      return true;
    };
    /**
     * A trip to something on the page it is already on. Reduced motion has no travel to show, only the mascot turning
     * up somewhere else, so there it stays where it is and the thing happens by itself.
     */
    const visit = async (next: Spot | null, along = false) => reduced ? next !== null : go(next, along);
    /** Says a line and gives it the time it takes to read. `hold` returns sooner, for a line that is acted out. */
    const say = async (line: number, hold = read(line)) => {
      open = true;
      patch({ line, speaking: true });
      await wait(hold);
    };
    /** Changes page: what is on screen fades out, then the next page fades in. */
    const swap = async (next: Partial<Scene>) => {
      patch({ fading: true });
      await wait(reduced ? 0 : 170);
      slid = 0;
      patch({ ...next, fading: false });
      await wait(reduced ? 50 : 260);
    };
    const press = async () => {
      if (!reduced) mascot.dataset.pressed = "";
      await wait(140);
      delete mascot.dataset.pressed;
      await wait(160);
    };

    // It starts on the header's face, which is empty while the tour runs, with nothing to animate from.
    mascot.style.transition = "none";
    put(home() ?? { x: frame.current.width / 2, y: frame.current.height / 2, scale: 1 });
    void mascot.offsetWidth;
    mascot.style.transition = "";
    if (!members) return;
    // The frame's pictures are fetched while the search is on screen, so the page that follows opens complete.
    for (const member of members) if (member.art) new Image().src = sharp(member.art);

    (async () => {
      setScene(OPENING);
      clock.set(ARCHIVE, ARCHIVE);
      await wait(350);

      // Search: it takes the prompt's place over the field and, while it is still talking, a name is typed and
      // the channel found live is picked.
      await go(greet());
      await say(0, 1300);
      await press();
      for (let typed = 1; typed <= star.login.length; typed++) {
        patch({ query: star.login.slice(0, typed), suggesting: typed >= 2 });
        await wait(Math.min(90, 1000 / star.login.length));
      }
      await wait(600);
      await visit(beside(find('.still-tour [role="option"]', 0.8)));
      await press();
      await swap({ view: "player", suggesting: false, playing: true });
      await go(seat());
      await wait(700);

      // Ads: Twitch's break takes the picture mid-sentence. The mascot goes and throws it out, and the picture says so.
      await say(1);
      patch({ slate: "ad" });
      await wait(350);
      await say(2);
      await visit(aim(".still-tour-picture", 0.5, 0.5, 0));
      if (!reduced) mascot.dataset.pressed = "";
      patch({ slate: "none", blocked: true });
      await wait(260);
      delete mascot.dataset.pressed;
      await wait(500);
      await go(seat());
      await say(3);
      patch({ blocked: false });

      // Rewind: the mascot drags the live edge back, and Live returns to it.
      await say(4);
      await say(5, 1400);
      await visit(perch(".still-tour .scrub-hit", 1), true);
      const origin = cast.getBoundingClientRect();
      const rail = root.querySelector(".scrub-hit")?.getBoundingClientRect();
      const scrub = root.querySelector(".scrub");
      const from = spot.current;
      if (reduced) clock.set(ARCHIVE * 0.68, ARCHIVE);
      else if (rail && scrub && from) {
        const lead = { x: held.x - from.x, y: held.y - from.y };
        mascot.dataset.pressed = mascot.dataset.dragging = speech.dataset.dragging = "";
        scrub.classList.add("scrub-scrubbing");
        await tween(1500, (progress) => {
          const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
          const time = ARCHIVE * (1 - 0.32 * eased);
          const x = rail.left - origin.left + rail.width * (time / ARCHIVE);
          clock.set(time, ARCHIVE);
          mascot.style.translate = `${x}px ${from.y}px`;
          speech.style.translate = `${x + lead.x}px ${from.y + lead.y}px`;
          spot.current = { ...from, x };
        });
        scrub.classList.remove("scrub-scrubbing");
        delete mascot.dataset.pressed;
        delete mascot.dataset.dragging;
        delete speech.dataset.dragging;
      }
      await wait(1300);
      await say(6, 900);
      // Room is left under the button for the bubble, which would otherwise cover the timeline as it snaps back.
      const button = aim(".still-tour .stage-live-trigger", 0.5, 0.5, 136);
      if (await visit(button && { ...button, sides: ["below", "above"] }, true)) await press();
      clock.set(ARCHIVE, ARCHIVE);
      await wait(1400);

      // Subscriber-only: the other way in, a pasted link, lands on a video Twitch keeps locked. The lock gives
      // way, and the video underneath plays.
      await speak(false);
      await swap({ view: "search", query: "", playing: false });
      await go(greet());
      await say(7, 1300);
      await press();
      patch({ query: LINK });
      await wait(700);
      await visit(beside(find(".still-tour .search-pill-submit")));
      await press();
      clock.set(0, VOD);
      await swap({ view: "player", mode: "vod", slate: "locked" });
      await go(seat());
      await wait(400);
      await say(8);
      await say(9, 1300);
      const lock = aim(".still-tour-lock", 1.9, 0.3, 96);
      // Under the lock is what it says, which a bubble must not cover.
      await visit(lock && { ...lock, sides: ["right", "left", "above", "below"] }, true);
      await press();
      patch({ slate: "opening" });
      await wait(800);
      patch({ slate: "none", playing: true });
      const began = performance.now();
      const ticking = setInterval(() => clock.set((performance.now() - began) / 1000, VOD), 250);
      try { await wait(2800); } finally { clearInterval(ticking); }

      // The home page comes back, the last words are said where the first were, and it goes home to the header.
      await speak(false);
      patch({ leaving: true, playing: false });
      await go(greet());
      await say(10);
      await go(home());
      finish();
    })().catch(() => {});

    return () => control.abort();
  }, [clock, members, star.login]);

  const shown = live ? star : locked;
  const channel = live ? profile(shown) : null;
  // A real channel is named only for what is true of it: that it is live. The locked video is nobody's.
  const title = live ? shown.title : "Subscriber-only VOD";

  return <>
    <div ref={stage} className="still-tour" data-view={scene.view} data-fading={scene.fading || undefined} data-leaving={scene.leaving || undefined}>
      {scene.view === "search" ? <div className="still-tour-search" inert>
        <SearchField
          value={scene.query}
          onValueChange={idle}
          onSubmit={idle}
          labels={SEARCH_LABELS}
          suggestions={[{ id: star.login, title: star.name, subtitle: star.game, imageUrl: star.art, thumbnail: "video", status: "live" }]}
          suggestionsOpen={scene.suggesting}
        />
      </div> : <div key={scene.mode} className="workspace-canvas still-main still-tour-page" inert>
        <div className={`media-content still-watch relative pb-8 ${live ? "still-channel-page" : ""}`}>
          <WatchLayout chatOpen={watchChat.open} chatState={watchChat.state}
            video={<PlayerStage title={title} subtitle={live ? shown.name : undefined} picture={
              <div className="still-tour-picture" style={picture(shown.art)}>
                {/* The locked video's blur is a small copy of the picture, blurred once and scaled up, that only fades. */}
                {!live && <span className="still-tour-veil" style={shown.art ? { backgroundImage: `url(${JSON.stringify(shown.art)})` } : undefined} data-shown={scene.slate === "locked" || undefined} />}
              </div>
            }>
              <div className="still-tour-slate" data-slate="ad" data-shown={scene.slate === "ad" || undefined}>
                <span>Ad 1 of 3</span>
                <p>Twitch ad break in progress</p>
              </div>
              <div className="still-tour-slate" data-slate="lock" data-shown={scene.slate === "locked" || scene.slate === "opening" || undefined} data-opening={scene.slate === "opening" || undefined}>
                <span className="still-tour-lock">{scene.slate === "opening" ? <LockOpen weight="fill" size={44} /> : <Lock weight="fill" size={44} />}</span>
                <p>{scene.slate === "opening" ? "Unlocked" : "Subscriber-only video"}</p>
              </div>
              <p className="still-tour-blocked" data-shown={scene.blocked || undefined}>Ad break blocked</p>
              <span className="still-tour-seat" />
              <TourControls clock={clock} live={live} title={title} playing={scene.playing} chatOpen={watchChat.open} />
            </PlayerStage>}
            rail={<WatchRail channel={live ? shown.login : "still"} displayName={live ? shown.name : "Subscriber-only VOD"} image={live ? shown.art ?? undefined : undefined} broadcastType={live ? "Live" : "Past broadcast"} actions={[
              <button key="chat" type="button" className="still-rail-action" aria-label={watchChat.open ? "Hide chat" : "Show chat"} aria-expanded={watchChat.open}><ChatCircle size={21} /></button>,
              ...(live ? [<button key="archive" type="button" className="still-rail-action" aria-label="Back to live"><Broadcast size={21} /></button>] : [
                <button key="download" type="button" className="still-rail-action" aria-label="Download"><DownloadSimple size={21} /></button>,
                <button key="share" type="button" className="still-rail-action" aria-label="Share"><ShareNetwork size={21} /></button>,
              ]),
            ]} />}
            chat={<TourChat clock={clock} live={live} playing={scene.playing} channel={shown.login} />}
          >
            <div className="still-watch-details">
              <VodInfo channel={live ? shown.login : "still"} channelDisplayName={title} broadcastType={live ? "live" : "archive"} title={title} isLive={live} titleOnly titleAs="h2" category={live ? shown.game || undefined : undefined} />
            </div>
          </WatchLayout>
          {channel && <section className="still-channel-profile" aria-label={`${channel.displayName} on Twitch`}>
            <ChannelHeader channel={channel} />
            <Catalog scope={{ kind: "channel", anchor: channel.login }} initial={UNANSWERED} />
          </section>}
          <Footer />
        </div>
      </div>}
    </div>
    <div ref={layer} className="still-tour-cast" role="dialog" aria-label="Welcome to Still">
      <p className="sr-only" aria-live="polite">{LINES[scene.line]}</p>
      <span ref={guide} className="still-tour-guide" data-speaking={scene.speaking || undefined} aria-hidden="true">
        <svg viewBox="0 0 64 64" focusable="false">
          <path fill="#f4f2eb" d="M26 10h12a22 22 0 0 1 0 44H26a22 22 0 0 1 0-44Z" />
          <path className="still-tour-eyes" fill="#101113" d="M18 28h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm20 0h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
        </svg>
      </span>
      <p ref={bubble} className="still-welcome-bubble" data-speaking={scene.speaking || undefined} aria-hidden="true"><span key={scene.line}>{LINES[scene.line]}</span></p>
      <button ref={skip} type="button" className="still-welcome-skip" onClick={finish}>Skip</button>
    </div>
  </>;
}
