export const BROADCAST_TYPES = ["ARCHIVE", "HIGHLIGHT", "UPLOAD", "PAST_PREMIERE"] as const;
export const PERIODS = ["LAST_DAY", "LAST_WEEK", "LAST_MONTH", "ALL_TIME"] as const;
export type BroadcastType = typeof BROADCAST_TYPES[number];
export type ClipPeriod = typeof PERIODS[number];
export interface CatalogItem { kind: "vod" | "clip"; id: string; slug?: string; title: string; createdAt: string; duration: number; views: number; thumbnail: string; owner?: string }
/** One bounded upstream request. A channel's videos may omit the type to list every kind together. */
export interface CatalogSlice {
  source: "channel-videos" | "game-videos" | "channel-clips" | "game-clips";
  anchor: string;
  first: number;
  sort: "TIME" | "VIEWS" | "TRENDING";
  type?: BroadcastType;
  period?: ClipPeriod;
  language?: string;
}
export interface SliceReceipt { slice: CatalogSlice; items: CatalogItem[]; fetchedAt: number; bytes: number; totalCount?: number }
export interface CatalogScope { kind: "channel" | "game"; anchor: string }
/** What the viewer has selected. Each view is answered by exactly one slice. */
export interface CatalogView { media: "vod" | "clip"; sort: "TIME" | "VIEWS"; period: ClipPeriod; type?: BroadcastType; language?: string }
