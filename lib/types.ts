// Shared types used across client and server

export type Container = "mp4" | "webm" | "mp3" | "ogg";

export type VideoQualityPreference =
  | "lowest"
  | "up_to_360p"
  | "up_to_480p"
  | "up_to_720p"
  | "up_to_1080p"
  | "highest";

export type QueryResultKind =
  | "video"
  | "playlist"
  | "channel"
  | "search"
  | "aggregate";

export type DownloadStatus =
  | "enqueued"
  | "started"
  | "bridging"      // WebSocket bridge connecting
  | "uploading"     // Browser fetching, uploading to server
  | "server_muxing" // Server muxing video+audio
  | "receiving"     // Receiving muxed output from server
  | "completed"
  | "failed"
  | "canceled";

export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  authorId: string;
  duration: number; // seconds
  thumbnailUrl: string;
  viewCount?: number;
  uploadDate?: string;
}

export interface StreamInfo {
  url: string;
  formatSpec?: string;
  container: Container;
  mimeType: string;
  bitrate: number;
  contentLength: number;
  isAudioOnly: boolean;
  // Video-specific
  qualityLabel?: string;
  width?: number;
  height?: number;
  fps?: number;
  // Audio-specific
  audioSampleRate?: number;
  audioChannels?: number;
  language?: string;
  isDefault?: boolean;
}

export interface DownloadOption {
  id: string; // unique key for this option
  formatSpec?: string;
  container: Container;
  isAudioOnly: boolean;
  qualityLabel: string | null; // e.g. "1080p", "720p"
  height: number | null;
  needsMuxing: boolean; // true if video+audio are separate streams
  streams: StreamInfo[];
  totalSize: number; // estimated bytes
}

export interface QueryResult {
  kind: QueryResultKind;
  title: string;
  videos: VideoInfo[];
}

export interface ResolveRequest {
  query: string;
}

export interface ResolveResponse {
  result: QueryResult;
}

export interface StreamsRequest {
  videoId: string;
}

export interface StreamsResponse {
  options: DownloadOption[];
}

export interface SearchRequest {
  query: string;
}

export interface SearchResponse {
  result: QueryResult;
}

export interface DownloadItem {
  id: string;
  video: VideoInfo;
  option: DownloadOption;
  status: DownloadStatus;
  progress: number; // 0-1
  errorMessage?: string;
  fileName: string;
  // WebSocket bridge fields
  wsSessionId?: string;
  wsDownloadId?: string;
  useBridge?: boolean;
}

export function isAudioOnlyContainer(container: Container): boolean {
  return container === "mp3" || container === "ogg";
}

export function containerDisplayName(container: Container): string {
  return container.toUpperCase();
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
