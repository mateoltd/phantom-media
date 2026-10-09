import type { PlaybackSegment } from "@phantom/ui/playback-segments";
import type { ResolvedQuality } from "./validation";

/** The playback response shared by the resolver and its client. */
export interface VodPlaybackData {
  vodId: string;
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  title?: string;
  previewThumbnailURL?: string;
  isLiveArchive?: boolean;
  broadcastType: string;
  qualities: ResolvedQuality[];
  segments: PlaybackSegment[];
}
