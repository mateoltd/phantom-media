import { BROADCAST_TYPES, PERIODS, type BroadcastType, type CatalogScope, type CatalogSlice, type CatalogView } from "./contracts.ts";
// Axes present in the captured Round 13 ID matrix. Clip enums have a narrower receipt.
export const VIDEO_LANGUAGES = ["en", "de", "fr", "es", "ru", "ja", "ko", "pt", "zh", "it", "pl", "tr", "cs", "ar"] as const;
export const CLIP_LANGUAGES = ["de", "fr", "es", "ru", "ja", "ko", "pt", "zh", "it", "pl", "tr"] as const;
/** Twitch offers no cursor here, so a view is one page. Sorting and filtering reach the rest. */
export const VIEW_SIZE = 100;
export const DEFAULT_VIEW: CatalogView = { media: "vod", sort: "TIME", period: "LAST_WEEK" };
export function validateSlice(value: unknown): CatalogSlice {
  if (!value || typeof value !== "object") throw new Error("Invalid slice");
  const slice = value as CatalogSlice;
  if (!["channel-videos", "game-videos", "channel-clips", "game-clips"].includes(slice.source) || typeof slice.anchor !== "string" || !slice.anchor.trim() || slice.anchor.length > 100) throw new Error("Invalid catalog source");
  const maximum = slice.source === "game-videos" ? 2500 : 100;
  if (!Number.isInteger(slice.first) || slice.first < 1 || slice.first > maximum) throw new Error("Invalid page size");
  if (Object.keys(slice).some(key => !["source", "anchor", "first", "sort", "type", "period", "language"].includes(key))) throw new Error("Unsupported slice field");
  if (slice.source.startsWith("channel") && !/^[a-z0-9_]{3,25}$/.test(slice.anchor)) throw new Error("Invalid channel");
  if (slice.source.endsWith("videos")) {
    if (!["TIME", "VIEWS"].includes(slice.sort) || slice.period) throw new Error("Invalid video axes");
    if (slice.source === "channel-videos" && ((slice.type !== undefined && !BROADCAST_TYPES.includes(slice.type as BroadcastType)) || slice.language)) throw new Error("Invalid channel video axes");
    if (slice.source === "game-videos" && (slice.type || (slice.language && !/^[a-z]{2}$/.test(slice.language)))) throw new Error("Invalid game video axes");
  } else {
    if (slice.sort !== "TRENDING" || !PERIODS.includes(slice.period!) || slice.type) throw new Error("Invalid clip axes");
    if (slice.source === "channel-clips" && slice.language) throw new Error("User clips have no language axis");
    if (slice.language && !/^[A-Z]{2}$/.test(slice.language)) throw new Error("Game clip languages use uppercase enums");
  }
  return { source: slice.source, anchor: slice.anchor, first: slice.first, sort: slice.sort, ...(slice.type ? { type: slice.type } : {}), ...(slice.period ? { period: slice.period } : {}), ...(slice.language ? { language: slice.language } : {}) };
}
export function sliceKey(slice: CatalogSlice): string { return JSON.stringify(validateSlice(slice)); }
/** The single request behind a view. Selections a source has no axis for are dropped, never sent. */
export function viewSlice(scope: CatalogScope, view: CatalogView): CatalogSlice {
  const game = scope.kind === "game";
  if (view.media === "vod") return validateSlice({ source: game ? "game-videos" : "channel-videos", anchor: scope.anchor, first: VIEW_SIZE, sort: view.sort,
    ...(game ? view.language ? { language: view.language.toLowerCase() } : {} : view.type ? { type: view.type } : {}) });
  return validateSlice({ source: game ? "game-clips" : "channel-clips", anchor: scope.anchor, first: VIEW_SIZE, sort: "TRENDING", period: view.period,
    ...(game && view.language ? { language: view.language.toUpperCase() } : {}) });
}
