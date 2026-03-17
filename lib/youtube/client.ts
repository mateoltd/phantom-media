import { Innertube, Platform, UniversalCache } from "youtubei.js";
import type { Types } from "youtubei.js";
import evaluate from "./evaluate";
import { getPoToken, invalidatePoToken } from "./potoken";

export type InnerTubeClient = Types.InnerTubeClient;

/**
 * Client types to try in order when fetching video info or downloading.
 * WEB is the default; ANDROID/IOS/TV_EMBEDDED use different InnerTube
 * endpoints that are often less aggressively bot-checked.
 */
export const CLIENT_FALLBACK_ORDER: InnerTubeClient[] = [
  "WEB",
  "ANDROID",
  "TV_EMBEDDED",
  "IOS",
];

let innertubeInstance: Innertube | null = null;
let platformPatched = false;

/**
 * Patch the Platform shim with our custom JS evaluator.
 * Required for deciphering YouTube stream URLs.
 */
function patchPlatform() {
  if (platformPatched) return;
  Platform.load({ ...Platform.shim, eval: evaluate });
  platformPatched = true;
}

async function createInnertube(): Promise<Innertube> {
  patchPlatform();

  let visitorData: string | undefined;
  let poToken: string | undefined;

  try {
    const result = await getPoToken();
    visitorData = result.visitorData;
    poToken = result.poToken;
  } catch (err) {
    console.error(
      "[innertube] PO token generation failed:",
      err instanceof Error ? err.message : err
    );
  }

  return Innertube.create({
    retrieve_player: true,
    generate_session_locally: true,
    enable_session_cache: true,
    cache: new UniversalCache(true),
    ...(visitorData ? { visitor_data: visitorData } : {}),
    ...(poToken ? { po_token: poToken } : {}),
  });
}

export async function getInnertube(): Promise<Innertube> {
  if (!innertubeInstance) {
    innertubeInstance = await createInnertube();
  }
  return innertubeInstance;
}

/**
 * Nuke the cached session + PO token and create fresh ones.
 * Call this when YouTube starts rejecting the current session.
 */
export async function resetInnertube(): Promise<Innertube> {
  invalidatePoToken();
  innertubeInstance = null;
  innertubeInstance = await createInnertube();
  return innertubeInstance;
}

/**
 * Run an async operation against the Innertube instance.
 * If every client type fails, reset the session (new PO token + visitor data)
 * and retry once.
 */
export async function withSessionRetry<T>(
  operation: (yt: Innertube) => Promise<T>
): Promise<T> {
  // First attempt with existing session
  try {
    const yt = await getInnertube();
    return await operation(yt);
  } catch {
    // Noop — fall through to retry
  }

  // Second attempt with a completely fresh session + PO token
  console.log("[innertube] Retrying with fresh session");
  const yt = await resetInnertube();
  return operation(yt);
}
