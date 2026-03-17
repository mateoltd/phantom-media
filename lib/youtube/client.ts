import { Innertube, Platform } from "youtubei.js";
import type { Types } from "youtubei.js";
import evaluate from "./evaluate";

export type InnerTubeClient = Types.InnerTubeClient;

/**
 * IOS client first: returns pre-signed direct URLs, no PO token required,
 * minimal bot detection. Mirrors cobalt.tools' production strategy.
 * WEB is last resort (needs player + PO token for URL deciphering).
 */
export const CLIENT_FALLBACK_ORDER: InnerTubeClient[] = [
  "IOS",
  "ANDROID",
  "TV_EMBEDDED",
  "WEB",
];

/**
 * These clients return pre-signed URLs — use format.url directly.
 * WEB/TV_EMBEDDED return cipher-scrambled URLs that need decipher().
 */
export const NO_CIPHER_CLIENTS = new Set<InnerTubeClient>([
  "IOS",
  "ANDROID",
]);

let innertubeInstance: Innertube | null = null;
let platformPatched = false;

function patchPlatform() {
  if (platformPatched) return;
  Platform.load({ ...Platform.shim, eval: evaluate });
  platformPatched = true;
}

async function createInnertube(): Promise<Innertube> {
  patchPlatform();
  // retrieve_player: false — skip player script fetch (avoids bot-checked
  // YouTube request at session creation time). IOS/ANDROID use pre-signed
  // URLs so no player deciphering is needed.
  return Innertube.create({
    retrieve_player: false,
    generate_session_locally: true,
  });
}

export async function getInnertube(): Promise<Innertube> {
  if (!innertubeInstance) {
    innertubeInstance = await createInnertube();
  }
  return innertubeInstance;
}

export async function resetInnertube(): Promise<Innertube> {
  innertubeInstance = null;
  innertubeInstance = await createInnertube();
  return innertubeInstance;
}

export async function withSessionRetry<T>(
  operation: (yt: Innertube) => Promise<T>
): Promise<T> {
  try {
    const yt = await getInnertube();
    return await operation(yt);
  } catch {
    // fall through
  }
  console.log("[innertube] Retrying with fresh session");
  const yt = await resetInnertube();
  return operation(yt);
}
