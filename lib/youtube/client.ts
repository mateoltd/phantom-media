import { Innertube, Platform, UniversalCache } from "youtubei.js";
import type { Types } from "youtubei.js";
import { BG } from "bgutils-js";
import evaluate from "./evaluate";

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

export async function getInnertube(): Promise<Innertube> {
  if (!innertubeInstance) {
    patchPlatform();

    // Step 1: Create a lightweight session to obtain visitor data
    const tempYt = await Innertube.create({
      retrieve_player: false,
      generate_session_locally: true,
    });

    const visitorData = tempYt.session.context.client?.visitorData;

    // Step 2: Generate a cold-start PO token using BgUtils.
    // This token attests the client is genuine and bypasses YouTube's
    // "Sign in to confirm you're not a bot" check on flagged ASN ranges.
    let poToken: string | undefined;
    if (visitorData) {
      try {
        poToken = BG.PoToken.generateColdStartToken(visitorData);
      } catch {
        // Continue without PO token if generation fails
      }
    }

    // Step 3: Create the full Innertube instance with PO token
    innertubeInstance = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
      enable_session_cache: true,
      cache: new UniversalCache(true),
      ...(visitorData ? { visitor_data: visitorData } : {}),
      ...(poToken ? { po_token: poToken } : {}),
    });
  }
  return innertubeInstance;
}

export async function resetInnertube(): Promise<Innertube> {
  innertubeInstance = null;
  return getInnertube();
}
