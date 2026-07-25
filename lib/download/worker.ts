import type {
  CreateDownloadJobRequest,
  DownloadJobStatusResponse,
  DownloadJobPhase,
  DownloadOption,
  DownloadStatus,
} from "@/lib/types";

export interface DownloadWorkerCallbacks {
  onProgress: (
    progress: number,
    details?: {
      phase?: DownloadJobPhase;
      downloadedBytes?: number;
      totalBytes?: number;
      bytesPerSecond?: number;
      etaSeconds?: number;
    }
  ) => void;
  onStatusChange: (status: DownloadStatus) => void;
  onError: (message: string) => void;
  signal: AbortSignal;
}

/**
 * Creates a bounded server-side yt-dlp job, polls its progress, then hands the
 * finished file to the browser's native download manager. Media is never held
 * in browser memory and the browser never contacts a YouTube CDN directly.
 */
export async function executeDownload(
  option: DownloadOption,
  videoId: string,
  fileName: string,
  callbacks: DownloadWorkerCallbacks
): Promise<void> {
  const { onProgress, onStatusChange, onError, signal } = callbacks;
  let jobId: string | undefined;
  let nativeDownloadTriggeredAt: number | undefined;

  try {
    const formatSpec = option.formatSpec ?? option.streams[0]?.formatSpec;
    if (!formatSpec) {
      throw new Error("Missing format selector");
    }

    onStatusChange("started");
    const input: CreateDownloadJobRequest = {
      videoId,
      formatSpec,
      container: option.container,
      isAudioOnly: option.isAudioOnly,
      fileName,
      expectedSize: option.totalSize,
    };

    const created = await createJob(input, signal, onProgress);
    jobId = created.id;

    while (!signal.aborted) {
      const job = await requestJson<DownloadJobStatusResponse>(
        `/api/download/jobs/${encodeURIComponent(jobId)}`,
        { signal }
      );
      onProgress(job.progress, {
        phase: job.phase,
        downloadedBytes: job.downloadedBytes,
        totalBytes: job.totalBytes,
        bytesPerSecond: job.bytesPerSecond,
        etaSeconds: job.etaSeconds,
      });

      if (
        job.status === "ready" &&
        job.fileUrl &&
        !nativeDownloadTriggeredAt
      ) {
        triggerNativeDownload(job.fileUrl, fileName);
        nativeDownloadTriggeredAt = Date.now();
      }
      if (job.status === "served") {
        onProgress(1, {
          phase: "complete",
          downloadedBytes: job.downloadedBytes,
          totalBytes: job.totalBytes,
        });
        onStatusChange("completed");
        return;
      }
      if (job.status === "failed") {
        throw new Error(job.error || "The server could not prepare the download");
      }
      if (job.status === "canceled") {
        return;
      }
      if (
        nativeDownloadTriggeredAt &&
        job.status === "ready" &&
        Date.now() - nativeDownloadTriggeredAt > 15_000
      ) {
        throw new Error(
          "The browser did not start the file transfer. Check automatic download permissions and try again."
        );
      }

      await abortableDelay(250, signal);
    }
  } catch (error) {
    if (signal.aborted) return;
    const message =
      error instanceof Error ? error.message : "Download failed";
    onError(message);
    onStatusChange("failed");
  } finally {
    if (signal.aborted && jobId) {
      void fetch(`/api/download/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        keepalive: true,
      });
    }
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * The server runs a limited number of jobs at once, so a busy answer means
 * "wait your turn", not "this download failed". Keep asking until a slot frees
 * up, and only surface the server's message once waiting stops being sensible.
 */
async function createJob(
  input: CreateDownloadJobRequest,
  signal: AbortSignal,
  onProgress: DownloadWorkerCallbacks["onProgress"]
): Promise<DownloadJobStatusResponse> {
  const giveUpAt = Date.now() + 5 * 60_000;

  for (;;) {
    try {
      return await requestJson<DownloadJobStatusResponse>(
        "/api/download/jobs",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal,
        }
      );
    } catch (error) {
      if (
        !(error instanceof HttpError) ||
        error.status !== 429 ||
        Date.now() >= giveUpAt
      ) {
        throw error;
      }
      onProgress(0, { phase: "queued" });
      const waitSeconds = Math.min(Math.max(error.retryAfterSeconds ?? 5, 2), 30);
      await abortableDelay(waitSeconds * 1_000, signal);
    }
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new HttpError(
      body?.error || `Request failed with status ${response.status}`,
      response.status,
      Number.parseInt(response.headers.get("Retry-After") ?? "", 10) || undefined
    );
  }
  return (await response.json()) as T;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Download canceled", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function triggerNativeDownload(url: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
