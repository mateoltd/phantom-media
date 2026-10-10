import { chatColor, mergeReplayMessages, type ChatMessage } from "./messages.ts";

export interface ReplayChatState {
  messages: ChatMessage[];
  status: string;
  error: string;
  partial?: boolean;
  gapAt?: number;
}

const REPLAY_WINDOW = 15;

// One session owns the offset and requests for one playback position. Explicit
// seeks and resyncs invalidate every response from the previous position.
export function createReplayChatSession({ vodId, getTime, onChange, onReset }: {
  vodId: string;
  getTime: () => number;
  onChange: (state: ReplayChatState) => void;
  onReset: () => void;
}) {
  let stopped = false;
  let controller: AbortController | null = null;
  let generation = 0;
  let busy = false;
  let previousTime = getTime();
  let nextOffset: number | null = null;
  let through = -1;
  let exhaustedAt: number | null = null;
  let messages: ChatMessage[] = [];
  let error = "";
  let gapAt: number | undefined;
  let published: ReplayChatState | undefined;

  function publish(now: number) {
    const status = error ? "Replay stalled"
      : exhaustedAt !== null ? "End of available replay"
      : through < 0 ? "Loading replay…"
      : through < now - REPLAY_WINDOW ? "Replay behind video"
      : through < now ? "Catching up…"
      : "Synced with video";
    if (published?.messages === messages && published.status === status && published.error === error) return;
    published = { messages, status, error, partial: true, gapAt };
    onChange(published);
  }

  function reset() {
    generation += 1;
    controller?.abort();
    busy = false;
    nextOffset = null;
    through = -1;
    exhaustedAt = null;
    messages = [];
    error = ""; gapAt = undefined;
    previousTime = Math.max(0, getTime());
    onReset();
    publish(previousTime);
  }

  async function update() {
    if (stopped) return;
    const now = Math.max(0, getTime());
    // Fallback for playback discontinuities without a native seek event.
    if (now < previousTime - 1 || now > previousTime + 10) reset();
    previousTime = now;

    // Live archives can acquire more comments after an apparent final page.
    // Retry from the playhead as it advances, without polling a paused video.
    if (exhaustedAt !== null && now > exhaustedAt + REPLAY_WINDOW) {
      exhaustedAt = null;
      nextOffset = null;
    }
    publish(now);
    if (busy || exhaustedAt !== null || error || through > now + REPLAY_WINDOW) return;

    busy = true;
    const currentGeneration = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const offset = nextOffset ?? Math.max(0, Math.floor(now) - REPLAY_WINDOW);
    const params = new URLSearchParams({ vodId, offset: String(offset) });
    try {
      // A user resync must not simply retrieve the same cached terminal page.
      const response = await fetch(`/api/vod/comments?${params}`, {
        signal, cache: nextOffset === null ? "no-store" : "default",
      });
      const data = await response.json();
      if (stopped || signal.aborted || currentGeneration !== generation) return;
      if (!response.ok) throw new Error(data.error || "Chat replay is unavailable");
      const incoming: ChatMessage[] = data.messages.map((message: ChatMessage) => ({
        ...message, color: message.color || chatColor(message.user),
      }));
      gapAt = data.coverage?.gapAt;
      messages = mergeReplayMessages(messages, incoming);
      through = Math.max(through, incoming.at(-1)?.offset ?? -1);
      if (data.nextOffset !== null && (!Number.isFinite(data.nextOffset) || data.nextOffset <= offset)) {
        throw new Error("Chat replay stopped advancing. Resync to the current video position.");
      }
      nextOffset = data.nextOffset;
      exhaustedAt = nextOffset === null ? Math.max(now, through) : null;
      publish(Math.max(0, getTime()));
    } catch (caught) {
      if (stopped || signal.aborted || currentGeneration !== generation) return;
      error = caught instanceof Error ? caught.message : "Chat replay is unavailable";
      publish(Math.max(0, getTime()));
    } finally {
      if (currentGeneration === generation) busy = false;
    }
  }

  return {
    update,
    resync: () => {
      if (stopped) return Promise.resolve();
      reset();
      return update();
    },
    stop: () => { stopped = true; controller?.abort(); },
  };
}
