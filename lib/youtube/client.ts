import { Innertube, Platform, UniversalCache } from "youtubei.js";
import type { Types } from "youtubei.js";
import evaluate from "./evaluate";
import { getPoToken } from "./potoken";

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

    // Generate a full BotGuard-attested PO token to bypass YouTube's
    // "Sign in to confirm you're not a bot" check on flagged ASN ranges.
    let visitorData: string | undefined;
    let poToken: string | undefined;

    try {
      const result = await getPoToken();
      visitorData = result.visitorData;
      poToken = result.poToken;
      console.log(
        `[innertube] PO token generated (length=${poToken.length})`
      );
    } catch (err) {
      console.error(
        "[innertube] PO token generation failed, continuing without:",
        err instanceof Error ? err.message : err
      );
    }

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
