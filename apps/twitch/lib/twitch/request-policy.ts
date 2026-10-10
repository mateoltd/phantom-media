import { UpstreamError } from "../errors.ts";

export const QUERY_FAMILIES: Record<string, string> = {
  ChannelBasics: "channel", SearchChannels: "channel-search", SearchCandidates: "search-candidates", VideoMetadata: "video",
  PlaybackAccessToken: "playback", VideoComments: "comments", RecentChannels: "channel",
  WatchedCategories: "video", DiscoveryDirectory: "directory", DiscoveryCategory: "game-discovery",
  RelatedChannels: "recommendations", DiscoveryExpansionCategory: "game-discovery",
  ChannelVideos: "channel-videos", CategoryVideos: "game-videos", ChannelClips: "channel-clips", CategoryClips: "game-clips",
  ClipMetadata: "clips", ClipSigning: "clip-signing", ExtensionCatalog: "extensions", ExtensionViewer: "extensions",
};

export function validateVariables(value: unknown): void {
  if (Array.isArray(value)) { value.forEach(validateVariables); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(after|cursor|userAuthorization|identityToken|clientIntegrity)$/i.test(key)) throw new UpstreamError("unavailable");
    validateVariables(item);
  }
}

/** Tokenize owned documents, skipping strings/comments before counting root aliases. */
export function documentPolicy(query: string): { name: string; family: string; aliases: number } {
  const tokens = query.match(/#[^\n]*|"(?:\\.|[^"\\])*"|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s,]/g) ?? [];
  const clean = tokens.filter(token => !token.startsWith("#"));
  if (clean[0] !== "query" || !QUERY_FAMILIES[clean[1]]) throw new UpstreamError("unavailable");
  let braces = 0, parentheses = 0, started = false, aliases = 0;
  for (let index = 2; index < clean.length; index++) {
    const token = clean[index];
    if (token === "(") parentheses++;
    if (token === ")") parentheses--;
    if (token === "{" && (started || parentheses === 0)) { started = true; braces++; }
    if (token === "}") {
      braces--;
      if (started && braces === 0 && index !== clean.length - 1) throw new UpstreamError("unavailable");
    }
    if (braces < 0 || parentheses < 0) throw new UpstreamError("schema");
    if (!started) continue;
    if (/^(after|cursor|userAuthorization|identityToken|clientIntegrity)$/i.test(token) && clean[index + 1] === ":") throw new UpstreamError("unavailable");
    if (braces === 1 && parentheses === 0 && clean[index + 1] === ":") aliases++;
    if (braces === 1 && /^(search|WatchTrack|__schema|__type|queryroots)$/.test(token)) throw new UpstreamError("unavailable");
  }
  if (!started || braces !== 0 || parentheses !== 0) throw new UpstreamError("schema");
  if (aliases > 15) throw new UpstreamError("cap");
  return { name: clean[1], family: QUERY_FAMILIES[clean[1]], aliases };
}

export function validatePageLimit(name: string, first: unknown): void {
  if (first === undefined) return;
  const maximum = name === "CategoryVideos" ? 2500 : name === "DiscoveryDirectory" ? 30 : 100;
  if (!Number.isInteger(first) || Number(first) < 1 || Number(first) > maximum) throw new UpstreamError("cap");
}
