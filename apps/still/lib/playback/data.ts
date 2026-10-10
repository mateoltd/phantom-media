import type { PlaybackSegment } from "@phantom/ui";
import type { ResourceRef, MediaVariant, Lifecycle, Chapter, Classification, PlaybackDiagnostics, ChannelData } from "../contracts.ts";
import type { FailureKind } from "../errors.ts";

export interface VodPlaybackData {
  resource: Extract<ResourceRef, { kind: "vod" }>;
  vodId: string;
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  channelIsPartner?: boolean;
  /** The owner as read while resolving the video, so the watch page can show the channel without asking again. */
  channelProfile?: ChannelData;
  title?: string;
  previewThumbnailURL?: string;
  seekPreviewsURL?: string;
  language?: string;
  duration: number;
  lifecycle: Lifecycle;
  isLiveArchive: boolean;
  broadcastType: string;
  qualities: MediaVariant[];
  segments: PlaybackSegment[];
  playback: { state: "ready"; source: "cdn" | "usher" } | { state: "unavailable"; reason: FailureKind };
  chapters: Chapter[];
  classification?: Classification;
  diagnostics?: PlaybackDiagnostics;
}

export interface ArchivePlaybackData extends Omit<VodPlaybackData, "resource" | "vodId"> {
  resource: Extract<ResourceRef, { kind: "archive" }>;
}
export interface ClipPlaybackData { slug: string; id: string; title: string; createdAt: string; duration?: number; thumbnail?: string; qualities: MediaVariant[]; expiresAt?: number; cacheUntil: number }
export interface VideoDetails { chapters: Chapter[]; classification?: Classification; availability: { chapters: "available" | "unavailable"; classification: "available" | "unavailable" } }
