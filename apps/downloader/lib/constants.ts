import type { Container, VideoQualityPreference } from "./types";

export const QUALITY_PRESETS: {
  value: VideoQualityPreference;
  label: string;
  maxHeight: number | null;
}[] = [
  { value: "highest", label: "Highest", maxHeight: null },
  { value: "up_to_1080p", label: "Up to 1080p", maxHeight: 1080 },
  { value: "up_to_720p", label: "Up to 720p", maxHeight: 720 },
  { value: "up_to_480p", label: "Up to 480p", maxHeight: 480 },
  { value: "up_to_360p", label: "Up to 360p", maxHeight: 360 },
  { value: "lowest", label: "Lowest", maxHeight: 0 },
];

export const CONTAINER_OPTIONS: { value: Container; label: string }[] = [
  { value: "mp4", label: "MP4" },
  { value: "webm", label: "WebM" },
  { value: "mp3", label: "MP3 (Audio)" },
  { value: "ogg", label: "OGG (Audio)" },
];

export const DEFAULT_PARALLEL_LIMIT = 2;

export const SEARCH_RESULT_LIMIT = 20;
