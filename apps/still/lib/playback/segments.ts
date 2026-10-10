import { normalizePlaybackSegments } from "@phantom/ui/playback-segments";
import type { TwitchVideoData } from "../twitch/videos";

/** Twitch's units and metadata shape stop here; the player only sees media intervals. */
export function getVodPlaybackSegments(video: Pick<TwitchVideoData, "muteInfo">) {
  return normalizePlaybackSegments((video.muteInfo?.mutedSegmentConnection?.nodes ?? []).map(({ offset, duration }) => ({
    id: `muted:${offset}:${duration}`,
    kind: "muted",
    start: offset,
    end: offset + duration,
    label: "Muted audio",
  })));
}
