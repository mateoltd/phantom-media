/**
 * WebSocket bridge download integration.
 *
 * Provides a high-level interface for executing downloads via the
 * WebSocket bridge, integrating with the existing download system.
 */

import { BridgeClient, type ConnectionState } from "./client";
import { FetchExecutor } from "./fetch-executor";
import {
  saveResumeState,
  getResumeState,
  deleteResumeState,
  createResumeState,
  appendOutputChunk,
  assembleOutput,
  type ResumeState,
} from "./resume-store";
import type {
  SessionInit,
  FetchCommand,
  MuxProgress,
  OutputChunk,
  OutputDone,
  ErrorMessage,
} from "./protocol";

export interface BridgeDownloadCallbacks {
  onStatusChange: (
    status:
      | "bridging"
      | "uploading"
      | "server_muxing"
      | "receiving"
      | "completed"
      | "failed"
  ) => void;
  onProgress: (progress: number) => void;
  onError: (message: string) => void;
  onComplete: (blob: Blob, fileName: string) => void;
}

export class BridgeDownload {
  private client: BridgeClient;
  private executor: FetchExecutor;
  private callbacks: BridgeDownloadCallbacks;
  private sessionId: string | null = null;
  private downloadId: string | null = null;
  private outputChunks: Map<number, Uint8Array> = new Map();
  private outputSize = 0;
  private expectedFileName: string = "";
  private aborted = false;

  constructor(callbacks: BridgeDownloadCallbacks) {
    this.callbacks = callbacks;

    this.client = new BridgeClient({
      onStateChange: this.handleStateChange.bind(this),
      onSessionInit: this.handleSessionInit.bind(this),
      onFetchCommand: this.handleFetchCommand.bind(this),
      onCancelCommand: this.handleCancelCommand.bind(this),
      onMuxProgress: this.handleMuxProgress.bind(this),
      onOutputChunk: this.handleOutputChunk.bind(this),
      onOutputDone: this.handleOutputDone.bind(this),
      onError: this.handleError.bind(this),
    });

    this.executor = new FetchExecutor(this.client);
  }

  /**
   * Start a download via the bridge
   */
  async start(videoId: string, optionId: string, fileName: string): Promise<void> {
    this.expectedFileName = fileName;
    this.aborted = false;

    this.callbacks.onStatusChange("bridging");
    this.callbacks.onProgress(0);

    this.client.connect();

    // Wait for session init
    await this.waitForSession();

    if (this.aborted) return;

    // Start the download
    this.client.startDownload(videoId, optionId);
    this.callbacks.onStatusChange("uploading");
  }

  /**
   * Resume a download
   */
  async resume(downloadId: string): Promise<void> {
    const state = await getResumeState(downloadId);
    if (!state) {
      this.callbacks.onError("No resume state found");
      this.callbacks.onStatusChange("failed");
      return;
    }

    this.downloadId = downloadId;
    this.expectedFileName = state.fileName;
    this.outputChunks = new Map(
      state.outputChunks.map((c) => [c.offset, c.data])
    );
    this.outputSize = state.outputSize;
    this.aborted = false;

    this.callbacks.onStatusChange("bridging");
    this.client.connect();

    await this.waitForSession();

    if (this.aborted) return;

    // Resume from last offsets
    this.client.resumeDownload(
      downloadId,
      state.videoOffset,
      state.audioOffset
    );
    this.callbacks.onStatusChange("uploading");
  }

  /**
   * Abort the download
   */
  abort(): void {
    this.aborted = true;
    this.executor.cancelAllFetches();
    this.client.disconnect();
  }

  private async waitForSession(): Promise<void> {
    const timeout = 10000; // 10 second timeout
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.sessionId || this.aborted) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          this.callbacks.onError("Connection timeout");
          this.callbacks.onStatusChange("failed");
          resolve(); // Resolve anyway to prevent hanging
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private handleStateChange(state: ConnectionState): void {
    if (state === "error" && !this.aborted) {
      this.callbacks.onError("Connection failed");
      this.callbacks.onStatusChange("failed");
    }
  }

  private handleSessionInit(session: SessionInit): void {
    this.sessionId = session.sessionId;
    this.executor.setHmacKey(session.hmacKey);
  }

  private handleFetchCommand(cmd: FetchCommand): void {
    this.executor.executeFetch(cmd);
    this.callbacks.onStatusChange("uploading");
  }

  private handleCancelCommand(fetchId: number): void {
    this.executor.cancelFetch(fetchId);
  }

  private handleMuxProgress(progress: MuxProgress): void {
    this.callbacks.onStatusChange("server_muxing");
    // Muxing is 60-100% of total progress
    this.callbacks.onProgress(0.6 + (progress.progress / 100) * 0.4);
  }

  private handleOutputChunk(chunk: OutputChunk): void {
    this.callbacks.onStatusChange("receiving");
    this.outputChunks.set(chunk.offset, chunk.data);
    this.outputSize += chunk.data.length;

    // Save to IndexedDB for resume
    if (this.downloadId) {
      appendOutputChunk(this.downloadId, chunk.offset, chunk.data);
    }
  }

  private async handleOutputDone(done: OutputDone): Promise<void> {
    // Assemble output
    const sortedOffsets = Array.from(this.outputChunks.keys()).sort(
      (a, b) => a - b
    );
    const totalSize = this.outputSize;
    const output = new Uint8Array(totalSize);

    for (const offset of sortedOffsets) {
      const chunk = this.outputChunks.get(offset)!;
      output.set(chunk, offset);
    }

    // Verify checksum
    const computedHash = await crypto.subtle.digest("SHA-256", output);
    const computedHashArray = new Uint8Array(computedHash);

    let checksumMatch = true;
    if (computedHashArray.length === done.checksum.length) {
      for (let i = 0; i < computedHashArray.length; i++) {
        if (computedHashArray[i] !== done.checksum[i]) {
          checksumMatch = false;
          break;
        }
      }
    } else {
      checksumMatch = false;
    }

    if (!checksumMatch) {
      this.callbacks.onError("Checksum mismatch");
      this.callbacks.onStatusChange("failed");
      return;
    }

    // Create blob and trigger download
    const blob = new Blob([output], { type: getMimeType(done.fileName) });

    // Clean up resume state
    if (this.downloadId) {
      await deleteResumeState(this.downloadId);
    }

    this.callbacks.onProgress(1);
    this.callbacks.onStatusChange("completed");
    this.callbacks.onComplete(blob, done.fileName || this.expectedFileName);

    // Disconnect
    this.client.disconnect();
  }

  private handleError(error: ErrorMessage): void {
    if (!this.aborted) {
      this.callbacks.onError(error.message);
      this.callbacks.onStatusChange("failed");
    }
  }
}

function getMimeType(fileName: string): string {
  if (fileName.endsWith(".mp4")) return "video/mp4";
  if (fileName.endsWith(".webm")) return "video/webm";
  if (fileName.endsWith(".mp3")) return "audio/mpeg";
  if (fileName.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

/**
 * Trigger browser download of a blob
 */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
