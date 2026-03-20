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
export const MAX_PARALLEL_LIMIT = 5;

export const PROXY_ALLOWED_DOMAINS = [
  "googlevideo.com",
  "youtube.com",
  "ytimg.com",
];

export const SEARCH_RESULT_LIMIT = 20;

// WebSocket Bridge Configuration
export const WS_BRIDGE_ENABLED = true;
export const WS_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const WS_MAX_SESSIONS_PER_IP = 3;
export const WS_MAX_BYTES_PER_SESSION = 2 * 1024 * 1024 * 1024; // 2GB
export const WS_PING_INTERVAL_MS = 30 * 1000; // 30 seconds
export const WS_COMMAND_MAX_AGE_MS = 60 * 1000; // 60 seconds
export const WS_MAX_CONCURRENT_FETCHES = 4;
export const WS_CHUNK_SIZE = 256 * 1024; // 256KB chunks
export const WS_TEMP_FILE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Allowed domains for WebSocket bridge fetch commands
export const WS_BRIDGE_ALLOWED_DOMAINS = [
  "googlevideo.com",
  "youtube.com",
  "ytimg.com",
  "ggpht.com",
];
