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
  | "completed"
  | "failed"
  | "canceled";

export type DownloadJobStatus =
  | "queued"
  | "processing"
  | "ready"
  | "serving"
  | "served"
  | "failed"
  | "canceled";

export type DownloadJobPhase =
  | "queued"
  | "resolving"
  | "downloading"
  | "processing"
  | "ready"
  | "transferring"
  | "complete";

export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  authorId: string;
  duration: number;
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
  qualityLabel?: string;
  width?: number;
  height?: number;
  fps?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  language?: string;
  isDefault?: boolean;
}

export interface DownloadOption {
  id: string;
  formatSpec?: string;
  container: Container;
  isAudioOnly: boolean;
  qualityLabel: string | null;
  height: number | null;
  needsMuxing: boolean;
  streams: StreamInfo[];
  totalSize: number;
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
  progress: number;
  phase?: DownloadJobPhase;
  downloadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  errorMessage?: string;
  fileName: string;
}

export interface CreateDownloadJobRequest {
  videoId: string;
  formatSpec: string;
  container: Container;
  isAudioOnly: boolean;
  fileName: string;
  expectedSize?: number;
}

export interface DownloadJobStatusResponse {
  id: string;
  status: DownloadJobStatus;
  progress: number;
  phase: DownloadJobPhase;
  downloadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  error?: string;
  fileUrl?: string;
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
