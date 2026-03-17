import { Innertube, Platform } from "youtubei.js";
import type { Types } from "youtubei.js";
import evaluate from "./evaluate";

export type InnerTubeClient = Types.InnerTubeClient;

/**
 * IOS client first: returns pre-signed direct URLs, no PO token required,
 * minimal bot detection. Mirrors cobalt.tools' production strategy.
 */
export const CLIENT_FALLBACK_ORDER: InnerTubeClient[] = [
  "IOS",
  "ANDROID",
];

/**
 * These clients return pre-signed URLs — use format.url directly.
 */
export const NO_CIPHER_CLIENTS = new Set<InnerTubeClient>([
  "IOS",
  "ANDROID",
]);

let innertubeInstance: Innertube | null = null;
let innertubePromise: Promise<Innertube> | null = null;
let platformPatched = false;

// Mutex to prevent concurrent session resets (thundering herd)
let resetLock: Promise<Innertube> | null = null;

// Cooldown: don't reset more than once per 5 seconds
let lastResetTime = 0;
const RESET_COOLDOWN_MS = 5000;

function patchPlatform() {
  if (platformPatched) return;
  Platform.load({ ...Platform.shim, eval: evaluate });
  platformPatched = true;
}

async function createInnertube(): Promise<Innertube> {
  patchPlatform();
  return Innertube.create({
    retrieve_player: false,
    generate_session_locally: true,
  });
}

export async function getInnertube(): Promise<Innertube> {
  // If instance exists, return it
  if (innertubeInstance) {
    return innertubeInstance;
  }
  // If creation is in progress, wait for it (prevents duplicate creation)
  if (innertubePromise) {
    return innertubePromise;
  }
  // Create new instance
  innertubePromise = createInnertube();
  try {
    innertubeInstance = await innertubePromise;
    return innertubeInstance;
  } finally {
    innertubePromise = null;
  }
}

export async function resetInnertube(): Promise<Innertube> {
  // If a reset is already in progress, wait for it instead of starting another
  if (resetLock) {
    return resetLock;
  }

  // Respect cooldown to avoid hammering YouTube
  const now = Date.now();
  if (now - lastResetTime < RESET_COOLDOWN_MS && innertubeInstance) {
    return innertubeInstance;
  }

  // Acquire the lock
  resetLock = (async () => {
    innertubeInstance = null;
    innertubePromise = null;
    lastResetTime = Date.now();
    const yt = await createInnertube();
    innertubeInstance = yt;
    return yt;
  })();

  try {
    return await resetLock;
  } finally {
    resetLock = null;
  }
}

export async function withSessionRetry<T>(
  operation: (yt: Innertube) => Promise<T>
): Promise<T> {
  try {
    const yt = await getInnertube();
    return await operation(yt);
  } catch {
    // fall through to retry
  }
  console.log("[innertube] Retrying with fresh session");
  const yt = await resetInnertube();
  return operation(yt);
}
