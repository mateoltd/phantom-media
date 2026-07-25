import { Innertube, Platform } from "youtubei.js";
import type { Types } from "youtubei.js";
import {
  fetchThroughProxyPool,
  hasConfiguredProxySource,
} from "@/lib/server/proxy-pool";
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

let innertubeInstance: Innertube | null = null;
let innertubePromise: Promise<Innertube> | null = null;
let platformPatched = false;

// Serialize session resets to prevent a thundering herd after a shared failure.
let resetLock: Promise<Innertube> | null = null;

let lastResetTime = 0;
const RESET_COOLDOWN_MS = 5000;

function patchPlatform() {
  if (platformPatched) return;

  Platform.load({
    ...Platform.shim,
    eval: evaluate,
    fetch: hasConfiguredProxySource()
      ? (fetchThroughProxyPool as typeof fetch)
      : Platform.shim.fetch,
  });
  platformPatched = true;
}

export function fetchYouTube(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return hasConfiguredProxySource()
    ? fetchThroughProxyPool(input, init)
    : fetch(input, init);
}

async function createInnertube(): Promise<Innertube> {
  patchPlatform();
  return Innertube.create({
    retrieve_player: false,
    generate_session_locally: true,
  });
}

export async function getInnertube(): Promise<Innertube> {
  if (innertubeInstance) {
    return innertubeInstance;
  }
  if (innertubePromise) {
    return innertubePromise;
  }
  innertubePromise = createInnertube();
  try {
    innertubeInstance = await innertubePromise;
    return innertubeInstance;
  } finally {
    innertubePromise = null;
  }
}

export async function resetInnertube(): Promise<Innertube> {
  if (resetLock) {
    return resetLock;
  }

  const now = Date.now();
  if (now - lastResetTime < RESET_COOLDOWN_MS && innertubeInstance) {
    return innertubeInstance;
  }

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
