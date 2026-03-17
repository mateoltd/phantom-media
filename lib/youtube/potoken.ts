import { BG } from "bgutils-js";
import { Innertube } from "youtubei.js";

const WAA_REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";

interface PoTokenData {
  visitorData: string;
  poToken: string;
  expiresAt: number;
}

let cachedToken: PoTokenData | null = null;

/**
 * Force-expire the cached PO token so the next call to getPoToken()
 * generates a fresh one. Call this when YouTube rejects the current token.
 */
export function invalidatePoToken(): void {
  cachedToken = null;
}

/**
 * Generate a full BotGuard-attested PO (Proof of Origin) token.
 *
 * Uses JSDOM to simulate a browser environment, then runs Google's BotGuard
 * attestation via the WAA API (jnn-pa.googleapis.com) — a different domain
 * from YouTube, so it works even when the server's ASN is blocked by YouTube.
 *
 * Tokens are cached and reused until they expire (TTL ~12 hours).
 */
export async function getPoToken(): Promise<{
  visitorData: string;
  poToken: string;
}> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return {
      visitorData: cachedToken.visitorData,
      poToken: cachedToken.poToken,
    };
  }

  // Step 1: Shim browser globals via JSDOM for BotGuard.
  // Dynamic import avoids ESM/CJS conflicts during Next.js build.
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM(
    "<!DOCTYPE html><html><head></head><body></body></html>",
    {
      url: "https://www.youtube.com/",
      referrer: "https://www.youtube.com/",
      pretendToBeVisual: true,
    }
  );

  Object.defineProperty(globalThis, "window", {
    value: dom.window,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: dom.window.document,
    configurable: true,
  });
  Object.defineProperty(globalThis, "location", {
    value: dom.window.location,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });

  // Step 2: Get visitor data from a lightweight local session
  const tempYt = await Innertube.create({
    retrieve_player: false,
    generate_session_locally: true,
  });

  const visitorData = tempYt.session.context.client?.visitorData;
  if (!visitorData) {
    throw new Error("Could not obtain visitor data");
  }

  // Step 3: Fetch BotGuard challenge from Google's WAA API
  const challenge = await BG.Challenge.create({
    fetch: globalThis.fetch,
    globalObj: globalThis,
    identifier: visitorData,
    requestKey: WAA_REQUEST_KEY,
  });

  if (!challenge) {
    throw new Error("Could not obtain BotGuard challenge");
  }

  // Step 4: Load the BotGuard interpreter script
  const script =
    challenge.interpreterJavascript
      .privateDoNotAccessOrElseSafeScriptWrappedValue;

  if (!script) {
    throw new Error("No BotGuard interpreter script in challenge");
  }

  new Function(script)();

  // Step 5: Generate the full PO token via BotGuard attestation
  const { poToken, integrityTokenData } = await BG.PoToken.generate({
    program: challenge.program,
    globalName: challenge.globalName,
    bgConfig: {
      fetch: globalThis.fetch,
      globalObj: globalThis,
      identifier: visitorData,
      requestKey: WAA_REQUEST_KEY,
    },
  });

  // Step 6: Cache the token
  const ttlMs = (integrityTokenData?.estimatedTtlSecs ?? 43200) * 1000;
  cachedToken = {
    visitorData,
    poToken,
    expiresAt: Date.now() + ttlMs,
  };

  return { visitorData, poToken };
}
