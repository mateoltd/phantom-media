export interface DownloadProgress {
  phase: "fetching" | "downloading" | "finalizing";
  downloaded: number;
  total: number;
  bytes: number;
}

// Adaptive concurrency: back off on slow mobile connections.
// On desktop/WiFi/4G this stays at 16; on 3G drops to 8; on 2G drops to 4.
function getConcurrency(): number {
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } })
    .connection;
  const type = conn?.effectiveType;
  if (type === "2g" || type === "slow-2g") return 4;
  if (type === "3g") return 8;
  return 16;
}

// First retry is immediate (catches transient CDN hiccups), then back off.
const RETRY_DELAYS_MS = [0, 400, 1200];

// Returns a Blob rather than ArrayBuffer.
// On mobile WebKit (iOS Safari, Chrome for Android) Blob objects are backed by
// a temporary file on disk, so individual segments never pile up in JS heap.
async function fetchWithRetry(url: string, signal: AbortSignal): Promise<Blob> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const resp = await fetch(url, { signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.blob();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

interface ParsedPlaylist {
  initSegmentUrl: string | null;
  segmentUrls: string[];
  extension: string;
}

function parsePlaylist(text: string, playlistUrl: string): ParsedPlaylist {
  const lines = text.split("\n");
  const segmentUrls: string[] = [];
  let initSegmentUrl: string | null = null;
  let extension = "ts";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-MAP:")) {
      const m = line.match(/URI="([^"]+)"/);
      if (m) {
        initSegmentUrl = new URL(m[1], playlistUrl).toString();
        extension = "mp4";
      }
    }
    if (line.startsWith("#EXTINF:")) {
      for (let j = i + 1; j < lines.length; j++) {
        const seg = lines[j].trim();
        if (seg && !seg.startsWith("#")) {
          segmentUrls.push(new URL(seg, playlistUrl).toString());
          i = j;
          break;
        }
      }
    }
  }

  return { initSegmentUrl, segmentUrls, extension };
}

// Generic ordered writer: accepts out-of-order pushes, flushes in-sequence.
// Workers download in parallel and may finish out of order; this ensures the
// output stream is always contiguous without stalling any worker.
class OrderedWriter<T> {
  private readonly pending = new Map<number, T>();
  private nextIdx = 0;
  private chain = Promise.resolve();

  constructor(private readonly sink: (item: T) => Promise<void>) {}

  push(index: number, item: T): void {
    this.pending.set(index, item);
    this.chain = this.chain.then(() => this.flush());
  }

  private async flush(): Promise<void> {
    while (this.pending.has(this.nextIdx)) {
      const item = this.pending.get(this.nextIdx)!;
      this.pending.delete(this.nextIdx);
      this.nextIdx++;
      await this.sink(item);
    }
  }

  drain(): Promise<void> {
    return this.chain;
  }
}

async function fetchParallel(
  urls: string[],
  writer: OrderedWriter<Blob>,
  onProgress: (downloaded: number, bytes: number) => void,
  signal: AbortSignal
): Promise<void> {
  const concurrency = getConcurrency();
  let cursor = 0;
  let downloaded = 0;
  let bytes = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const idx = cursor++;
      if (idx >= urls.length) return;
      const blob = await fetchWithRetry(urls[idx], signal);
      writer.push(idx, blob);
      bytes += blob.size;
      onProgress(++downloaded, bytes);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, worker)
  );
  await writer.drain();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type FSAWindow = Window & {
  showSaveFilePicker?: (opts: object) => Promise<{
    createWritable: () => Promise<{
      write: (d: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

// Stream directly to disk via File System Access API (Chrome/Edge desktop).
// Zero heap accumulation — each segment is written and released immediately.
async function downloadWithFSA(
  playlist: ParsedPlaylist,
  filename: string,
  total: number,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  const handle = await (window as FSAWindow).showSaveFilePicker!({
    suggestedName: filename,
    types: [
      {
        description: "Video file",
        accept:
          playlist.extension === "mp4"
            ? { "video/mp4": [".mp4"] }
            : { "video/mp2t": [".ts"] },
      },
    ],
  });

  const writable = await handle.createWritable();
  let downloaded = 0;
  let bytes = 0;

  try {
    if (playlist.initSegmentUrl) {
      const blob = await fetchWithRetry(playlist.initSegmentUrl, signal);
      await writable.write(blob);
      bytes += blob.size;
      downloaded++;
      onProgress({ phase: "downloading", downloaded, total, bytes });
    }

    const initOffset = playlist.initSegmentUrl ? 1 : 0;
    await fetchParallel(
      playlist.segmentUrls,
      new OrderedWriter<Blob>(async (blob) => writable.write(blob)),
      (dl, b) => {
        downloaded = initOffset + dl;
        bytes = b;
        onProgress({ phase: "downloading", downloaded, total, bytes });
      },
      signal
    );

    onProgress({ phase: "finalizing", downloaded, total, bytes });
  } finally {
    await writable.close();
  }
}

// Blob-accumulation path for mobile and Firefox/Safari.
// new Blob([blob1, blob2, ...]) creates a lazy composite — no data is copied,
// just references are chained. On WebKit (iOS/Android), individual Blobs are
// also backed by temp files on disk, so JS heap pressure stays low.
async function downloadBlobs(
  playlist: ParsedPlaylist,
  filename: string,
  total: number,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  const mimeType =
    playlist.extension === "mp4" ? "video/mp4" : "video/mp2t";
  const parts: Blob[] = [];
  let downloaded = 0;
  let bytes = 0;

  if (playlist.initSegmentUrl) {
    const blob = await fetchWithRetry(playlist.initSegmentUrl, signal);
    parts.push(blob);
    bytes += blob.size;
    downloaded++;
    onProgress({ phase: "downloading", downloaded, total, bytes });
  }

  const initOffset = playlist.initSegmentUrl ? 1 : 0;
  await fetchParallel(
    playlist.segmentUrls,
    new OrderedWriter<Blob>(async (blob) => {
      parts.push(blob);
    }),
    (dl, b) => {
      downloaded = initOffset + dl;
      bytes = b;
      onProgress({ phase: "downloading", downloaded, total, bytes });
    },
    signal
  );

  onProgress({ phase: "finalizing", downloaded, total, bytes });

  // Lazy composite blob — no byte copy, just a reference chain.
  triggerBlobDownload(new Blob(parts, { type: mimeType }), filename);
}

export async function downloadVod(
  playlistUrl: string,
  baseFilename: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  onProgress({ phase: "fetching", downloaded: 0, total: 0, bytes: 0 });

  const resp = await fetch(playlistUrl, { signal });
  if (!resp.ok) throw new Error(`Failed to fetch playlist: ${resp.status}`);
  const playlist = parsePlaylist(await resp.text(), playlistUrl);

  const filename = `${baseFilename}.${playlist.extension}`;
  const total =
    playlist.segmentUrls.length + (playlist.initSegmentUrl ? 1 : 0);

  // FSA path: Chrome/Edge desktop — zero heap, streams to disk.
  const fsaAvailable =
    typeof window !== "undefined" && "showSaveFilePicker" in window;

  if (fsaAvailable) {
    try {
      await downloadWithFSA(playlist, filename, total, onProgress, signal);
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // Any other FSA error (SecurityError, user cancel, etc.) → fall through
    }
  }

  // Blob path: mobile Safari/Chrome, Firefox — disk-backed Blobs, lazy concat.
  await downloadBlobs(playlist, filename, total, onProgress, signal);
}
