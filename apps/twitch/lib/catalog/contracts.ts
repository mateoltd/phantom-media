export const BROADCAST_TYPES = ["ARCHIVE", "HIGHLIGHT", "UPLOAD", "PAST_PREMIERE"] as const;
export const PERIODS = ["LAST_DAY", "LAST_WEEK", "LAST_MONTH", "ALL_TIME"] as const;
export type BroadcastType = typeof BROADCAST_TYPES[number];
export type ClipPeriod = typeof PERIODS[number];
export const LIVE_ORDERS = ["VIEWER_COUNT", "VIEWER_COUNT_ASC", "RECENT"] as const;
export type LiveOrder = typeof LIVE_ORDERS[number];
/** A live item is a stream: `views` counts who is watching now, and `ownerName` is the channel as it writes its own name. */
export interface CatalogItem { kind: "vod" | "clip" | "live"; id: string; slug?: string; title: string; createdAt: string; duration: number; views: number; thumbnail: string; owner?: string; ownerName?: string }
/** One bounded upstream request. A channel's videos may omit the type to list every kind together. */
export interface CatalogSlice {
  source: "channel-videos" | "game-videos" | "channel-clips" | "game-clips" | "game-streams";
  anchor: string;
  first: number;
  sort: "TIME" | "VIEWS" | "TRENDING" | LiveOrder;
  type?: BroadcastType;
  period?: ClipPeriod;
  language?: string;
  /** A category's Twitch ID. Names are not unique among categories, so when it is known it is what gets asked for. */
  id?: string;
}
export interface SliceReceipt { slice: CatalogSlice; items: CatalogItem[]; fetchedAt: number; bytes: number; totalCount?: number }
export interface CatalogScope { kind: "channel" | "game"; anchor: string; id?: string }
/** What the viewer has selected. Each view is answered by exactly one slice. */
export interface CatalogView { media: "live" | "vod" | "clip"; sort: "TIME" | "VIEWS"; period: ClipPeriod; order: LiveOrder; type?: BroadcastType; language?: string }
