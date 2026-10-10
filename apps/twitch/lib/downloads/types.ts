export interface DownloadProgress {
  phase: "fetching" | "downloading" | "finalizing";
  downloaded: number;
  total: number;
  bytes: number;
}
export interface OutputSink { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }
export type ProgressListener = (progress: DownloadProgress) => void;
