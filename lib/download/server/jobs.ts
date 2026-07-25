import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
  Container,
  CreateDownloadJobRequest,
  DownloadJobPhase,
  DownloadJobStatus,
  DownloadJobStatusResponse,
} from "@/lib/types";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const FORMAT_SPEC_PATTERN = /^\d+(?:\+\d+)?$/;
const TERMINAL_TTL_MS = 30 * 60 * 1000;
const SERVED_TTL_MS = 30 * 60 * 1000;
const MAX_ERROR_LENGTH = 4_000;
const MUXING_HEADROOM = 2.2;
const UNKNOWN_SIZE_RESERVATION = 768 * 1024 * 1024;

interface DownloadJob {
  id: string;
  clientIp: string;
  videoId: string;
  formatSpec: string;
  container: Container;
  isAudioOnly: boolean;
  fileName: string;
  expectedSize?: number;
  status: DownloadJobStatus;
  phase: DownloadJobPhase;
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  formatProgress: Map<
    string,
    { downloadedBytes: number; totalBytes?: number }
  >;
  transferBytes: number;
  transferStartedAt?: number;
  createdAt: number;
  updatedAt: number;
  directory?: string;
  outputPath?: string;
  outputSize?: number;
  error?: string;
  process?: ChildProcess;
  servedAt?: number;
}

interface DownloadJobRegistry {
  jobs: Map<string, DownloadJob>;
  queue: string[];
  active: number;
  cleanupTimer?: NodeJS.Timeout;
}

const globalJobs = globalThis as typeof globalThis & {
  __ewyoutubeDownloadJobs?: DownloadJobRegistry;
};

const registry: DownloadJobRegistry =
  globalJobs.__ewyoutubeDownloadJobs ?? {
    jobs: new Map(),
    queue: [],
    active: 0,
  };

globalJobs.__ewyoutubeDownloadJobs = registry;

if (!registry.cleanupTimer) {
  registry.cleanupTimer = setInterval(() => {
    void cleanupExpiredJobs();
  }, 60_000);
  registry.cleanupTimer.unref();
}

export class DownloadJobLimitError extends Error {}
export class InvalidDownloadJobError extends Error {}

export function createDownloadJob(
  input: CreateDownloadJobRequest,
  clientIp: string
): DownloadJobStatusResponse {
  const request = validateRequest(input);
  enforceCapacity(clientIp, request.expectedSize);

  const now = Date.now();
  const job: DownloadJob = {
    id: randomUUID(),
    clientIp,
    ...request,
    status: "queued",
    phase: "queued",
    progress: 0,
    formatProgress: new Map(),
    transferBytes: 0,
    createdAt: now,
    updatedAt: now,
  };

  registry.jobs.set(job.id, job);
  registry.queue.push(job.id);
  drainQueue();

  return serializeJob(job);
}

export function getDownloadJob(
  jobId: string
): DownloadJobStatusResponse | null {
  const job = registry.jobs.get(jobId);
  return job ? serializeJob(job) : null;
}

export function getDownloadJobFile(jobId: string): {
  path: string;
  size: number;
  fileName: string;
  contentType: string;
} | null {
  const job = registry.jobs.get(jobId);
  if (
    !job ||
    !["ready", "serving"].includes(job.status) ||
    !job.outputPath ||
    !job.outputSize
  ) {
    return null;
  }

  job.status = "serving";
  job.phase = "transferring";
  job.progress = Math.max(job.progress, 0.96);
  job.transferBytes = 0;
  job.transferStartedAt = Date.now();
  job.downloadedBytes = 0;
  job.totalBytes = job.outputSize;
  job.bytesPerSecond = undefined;
  job.etaSeconds = undefined;
  job.servedAt = Date.now();
  job.updatedAt = job.servedAt;

  return {
    path: job.outputPath,
    size: job.outputSize,
    fileName: job.fileName,
    contentType: contentTypeFor(job.container, job.isAudioOnly),
  };
}

export function recordDownloadJobTransfer(
  jobId: string,
  absoluteBytes: number,
  requestBytes: number
): void {
  const job = registry.jobs.get(jobId);
  if (!job || job.status !== "serving" || !job.outputSize) return;

  job.transferBytes = Math.max(job.transferBytes, absoluteBytes);
  job.downloadedBytes = Math.min(job.transferBytes, job.outputSize);
  job.totalBytes = job.outputSize;
  job.progress = 0.96 + Math.min(job.transferBytes / job.outputSize, 1) * 0.04;
  if (job.transferStartedAt) {
    const elapsedSeconds = (Date.now() - job.transferStartedAt) / 1000;
    if (elapsedSeconds > 0) {
      job.bytesPerSecond = requestBytes / elapsedSeconds;
      job.etaSeconds =
        job.bytesPerSecond > 0
          ? Math.ceil(
              (job.outputSize - job.downloadedBytes) / job.bytesPerSecond
            )
          : undefined;
    }
  }
  job.updatedAt = Date.now();
}

export function finishDownloadJobTransfer(
  jobId: string,
  completed: boolean
): void {
  const job = registry.jobs.get(jobId);
  if (!job || job.status !== "serving") return;

  if (completed) {
    job.status = "served";
    job.phase = "complete";
    job.progress = 1;
    job.downloadedBytes = job.outputSize;
    job.totalBytes = job.outputSize;
    job.bytesPerSecond = undefined;
    job.etaSeconds = 0;
    const cleanupTimer = setTimeout(() => {
      void cleanupJobDirectory(job);
    }, 1_000);
    cleanupTimer.unref();
  } else {
    job.status = "ready";
    job.phase = "ready";
    job.progress = 0.96;
  }
  job.updatedAt = Date.now();
}

export function cancelDownloadJob(jobId: string): boolean {
  const job = registry.jobs.get(jobId);
  if (!job) return false;

  if (job.status === "queued") {
    registry.queue = registry.queue.filter((id) => id !== jobId);
  }

  if (job.status === "processing") {
    terminateProcess(job.process);
  }

  job.status = "canceled";
  job.updatedAt = Date.now();
  if (!job.process) {
    void cleanupJobDirectory(job);
  }
  drainQueue();
  return true;
}

function drainQueue(): void {
  const maxConcurrent = readPositiveInteger(
    process.env.DOWNLOAD_MAX_CONCURRENT,
    2
  );

  while (registry.active < maxConcurrent && registry.queue.length > 0) {
    const jobId = registry.queue.shift();
    if (!jobId) break;

    const job = registry.jobs.get(jobId);
    if (!job || job.status !== "queued") continue;

    registry.active++;
    void runJob(job).finally(() => {
      registry.active--;
      drainQueue();
    });
  }
}

async function runJob(job: DownloadJob): Promise<void> {
  job.status = "processing";
  job.phase = "resolving";
  job.progress = 0.02;
  job.updatedAt = Date.now();

  try {
    const root = process.env.DOWNLOAD_TEMP_DIR ?? tmpdir();
    await mkdir(root, { recursive: true });
    job.directory = await mkdtemp(join(root, "ewyoutube-"));
    if (isJobCanceled(job)) {
      await cleanupJobDirectory(job);
      return;
    }

    const outputTemplate = join(job.directory, "output.%(ext)s");
    const args = buildYtDlpArgs(job, outputTemplate);
    const executable = process.env.YT_DLP_PATH ?? "yt-dlp";
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    });
    job.process = child;
    let timedOut = false;
    const timeoutMs =
      readPositiveInteger(process.env.DOWNLOAD_JOB_TIMEOUT_SECONDS, 1_800) *
      1_000;
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateProcess(child);
    }, timeoutMs);
    timeout.unref();

    let diagnostic = "";
    const capture = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      diagnostic = `${diagnostic}${text}`.slice(-MAX_ERROR_LENGTH);
      updateJobOutput(job, text);
    };

    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);

    let exitCode: number;
    try {
      exitCode = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code) => resolve(code ?? 1));
      });
    } finally {
      clearTimeout(timeout);
      job.process = undefined;
    }

    if (isJobCanceled(job)) {
      await cleanupJobDirectory(job);
      return;
    }

    if (timedOut) {
      throw new Error("The download exceeded the server time limit");
    }

    if (exitCode !== 0) {
      throw new Error(extractSafeError(diagnostic, exitCode));
    }

    const outputPath = await findOutputFile(job.directory);
    job.phase = "processing";
    job.progress = Math.max(job.progress, 0.95);
    const outputStats = await stat(outputPath);
    job.outputPath = outputPath;
    job.outputSize = outputStats.size;
    job.progress = 0.96;
    job.status = "ready";
    job.phase = "ready";
    job.updatedAt = Date.now();
  } catch (error) {
    job.process = undefined;
    if (isJobCanceled(job)) {
      await cleanupJobDirectory(job);
      return;
    }

    job.status = "failed";
    job.error =
      error instanceof Error ? error.message : "The download process failed";
    job.updatedAt = Date.now();
    await cleanupJobDirectory(job);
  }
}

function buildYtDlpArgs(job: DownloadJob, outputTemplate: string): string[] {
  const maxDuration = readPositiveInteger(
    process.env.DOWNLOAD_MAX_DURATION_SECONDS,
    14_400
  );
  const maxFileSize =
    process.env.DOWNLOAD_MAX_FILESIZE?.trim() || "2G";

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--no-colors",
    "--newline",
    "--progress",
    "--progress-delta",
    "0.2",
    "--progress-template",
    "download:ewyoutube|%(info.format_id)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress._percent_str)s",
    "--concurrent-fragments",
    "4",
    "--retries",
    "5",
    "--fragment-retries",
    "5",
    "--socket-timeout",
    "20",
    "--max-filesize",
    maxFileSize,
    "--match-filter",
    `duration <=? ${maxDuration}`,
    "--format",
    job.formatSpec,
    "--output",
    outputTemplate,
  ];

  const proxyUrl = process.env.EWYOUTUBE_PROXY_URL?.trim();
  if (proxyUrl) {
    args.push("--proxy", proxyUrl);
  }

  const ffmpegPath = process.env.FFMPEG_PATH?.trim();
  if (ffmpegPath) {
    args.push("--ffmpeg-location", ffmpegPath);
  }

  if (job.container === "mp3") {
    args.push("--extract-audio", "--audio-format", "mp3", "--audio-quality", "0");
  } else if (job.container === "ogg") {
    args.push(
      "--extract-audio",
      "--audio-format",
      "vorbis",
      "--audio-quality",
      "0"
    );
  } else if (!job.isAudioOnly) {
    args.push("--merge-output-format", job.container);
  }

  args.push(`https://www.youtube.com/watch?v=${job.videoId}`);
  return args;
}

function updateJobOutput(job: DownloadJob, output: string): void {
  if (
    /\[(Merger|ExtractAudio|VideoRemuxer|AudioFix)\]/.test(output)
  ) {
    job.phase = "processing";
    job.progress = Math.max(job.progress, 0.95);
  }

  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith("ewyoutube|")) continue;
    const [
      ,
      formatId,
      downloadedRaw,
      totalRaw,
      estimatedRaw,
      speedRaw,
      etaRaw,
    ] = line.split("|");
    const downloadedBytes = parseYtDlpNumber(downloadedRaw);
    const totalBytes =
      parseYtDlpNumber(totalRaw) ?? parseYtDlpNumber(estimatedRaw);
    if (!formatId || downloadedBytes === undefined) continue;

    job.formatProgress.set(formatId, { downloadedBytes, totalBytes });
    const formats = [...job.formatProgress.values()];
    const aggregateDownloaded = formats.reduce(
      (sum, format) => sum + format.downloadedBytes,
      0
    );
    const observedTotal = formats.reduce(
      (sum, format) => sum + (format.totalBytes ?? 0),
      0
    );
    const total = job.expectedSize || observedTotal || undefined;

    job.phase = "downloading";
    job.downloadedBytes = aggregateDownloaded;
    job.totalBytes = total;
    job.bytesPerSecond = parseYtDlpNumber(speedRaw);
    job.etaSeconds = parseYtDlpNumber(etaRaw);
    if (total && total > 0) {
      job.progress = Math.max(
        job.progress,
        Math.min(aggregateDownloaded / total, 1) * 0.94
      );
    }
    job.updatedAt = Date.now();
  }
}

function parseYtDlpNumber(value: string | undefined): number | undefined {
  if (!value || value === "NA") return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function findOutputFile(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter(
    (entry) =>
      entry.isFile() &&
      !entry.name.endsWith(".part") &&
      !entry.name.endsWith(".ytdl")
  );

  if (files.length === 0) {
    throw new Error("The download completed without producing an output file");
  }

  const candidates = await Promise.all(
    files.map(async (entry) => {
      const path = join(directory, entry.name);
      return { path, size: (await stat(path)).size };
    })
  );

  candidates.sort((a, b) => b.size - a.size);
  return candidates[0].path;
}

function validateRequest(input: CreateDownloadJobRequest): {
  videoId: string;
  formatSpec: string;
  container: Container;
  isAudioOnly: boolean;
  fileName: string;
  expectedSize?: number;
} {
  const videoId = input.videoId?.trim();
  const formatSpec = input.formatSpec?.trim();
  const containers: Container[] = ["mp4", "webm", "mp3", "ogg"];

  if (!VIDEO_ID_PATTERN.test(videoId ?? "")) {
    throw new InvalidDownloadJobError("Invalid video ID");
  }
  if (!FORMAT_SPEC_PATTERN.test(formatSpec ?? "")) {
    throw new InvalidDownloadJobError("Invalid format selector");
  }
  if (!containers.includes(input.container)) {
    throw new InvalidDownloadJobError("Unsupported output container");
  }

  return {
    videoId,
    formatSpec,
    container: input.container,
    isAudioOnly: Boolean(input.isAudioOnly),
    fileName: sanitizeFileName(input.fileName, input.container),
    expectedSize:
      typeof input.expectedSize === "number" &&
      Number.isSafeInteger(input.expectedSize) &&
      input.expectedSize > 0
        ? input.expectedSize
        : undefined,
  };
}

function sanitizeFileName(fileName: string, container: Container): string {
  const cleaned = basename(fileName || `download.${container}`)
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  const fallback = `download.${container}`;
  if (!cleaned) return fallback;
  const stem = cleaned
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/^\.+|\.+$/g, "")
    .trim();
  if (!stem) return fallback;
  return `${stem}.${container}`;
}

function enforceCapacity(clientIp: string, expectedSize?: number): void {
  const maxPending = readPositiveInteger(process.env.DOWNLOAD_MAX_PENDING, 20);
  const maxPerIp = readPositiveInteger(process.env.DOWNLOAD_MAX_JOBS_PER_IP, 3);
  const maxTempBytes = readPositiveInteger(
    process.env.DOWNLOAD_MAX_TEMP_BYTES,
    8 * 1024 * 1024 * 1024
  );
  const maxFileBytes = parseByteSize(
    process.env.DOWNLOAD_MAX_FILESIZE,
    2 * 1024 * 1024 * 1024
  );
  const jobs = [...registry.jobs.values()];
  const pending = jobs.filter(isCapacityHoldingJob);
  const pendingForIp = pending.filter((job) => job.clientIp === clientIp);
  const usedBytes = jobs.reduce(
    (total, job) => total + reservedBytesFor(job, maxFileBytes),
    0
  );
  const incomingBytes = reservationFor(expectedSize, maxFileBytes);

  if (pending.length >= maxPending) {
    throw new DownloadJobLimitError("The server download queue is full");
  }
  if (pendingForIp.length >= maxPerIp) {
    throw new DownloadJobLimitError(
      "Too many downloads are already queued from this address"
    );
  }
  if (usedBytes + incomingBytes > maxTempBytes) {
    throw new DownloadJobLimitError(
      "The server does not have enough temporary capacity for another download"
    );
  }
}

/**
 * Temporary space a job is expected to occupy. Reserving the maximum allowed
 * file size for every job would let two ordinary videos exhaust the budget, so
 * the estimate follows the size the client actually asked for.
 */
function reservationFor(
  expectedSize: number | undefined,
  maxFileBytes: number
): number {
  const ceiling = maxFileBytes * 2;
  if (!expectedSize) return Math.min(UNKNOWN_SIZE_RESERVATION, ceiling);
  return Math.min(Math.ceil(expectedSize * MUXING_HEADROOM), ceiling);
}

function reservedBytesFor(job: DownloadJob, maxFileBytes: number): number {
  if (job.outputSize) return job.outputSize;
  if (!job.directory && !isCapacityHoldingJob(job)) return 0;
  return Math.max(
    job.downloadedBytes ?? 0,
    reservationFor(job.expectedSize, maxFileBytes)
  );
}

function isCapacityHoldingJob(job: DownloadJob): boolean {
  return (
    job.status === "queued" ||
    job.status === "processing" ||
    job.status === "serving" ||
    (job.status === "ready" && !job.servedAt)
  );
}

function isJobCanceled(job: DownloadJob): boolean {
  return job.status === "canceled";
}

function terminateProcess(child?: ChildProcess): void {
  if (!child?.pid || child.killed) return;

  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }

  const timer = setTimeout(() => {
    if (child.exitCode !== null) return;
    try {
      if (process.platform === "win32") {
        child.kill("SIGKILL");
      } else {
        process.kill(-child.pid!, "SIGKILL");
      }
    } catch {
      child.kill("SIGKILL");
    }
  }, 5_000);
  timer.unref();
}

async function cleanupExpiredJobs(): Promise<void> {
  const now = Date.now();
  for (const [jobId, job] of registry.jobs) {
    if (job.status === "queued" || job.status === "processing") continue;

    const ttl = job.servedAt ? SERVED_TTL_MS : TERMINAL_TTL_MS;
    if (now - job.updatedAt < ttl) continue;

    if (await cleanupJobDirectory(job)) {
      registry.jobs.delete(jobId);
    }
  }
}

async function cleanupJobDirectory(job: DownloadJob): Promise<boolean> {
  const directory = job.directory;
  if (!directory) return true;
  try {
    await rm(directory, { recursive: true, force: true });
    job.directory = undefined;
    job.outputPath = undefined;
    job.outputSize = undefined;
    return true;
  } catch {
    return false;
  }
}

function extractSafeError(output: string, exitCode: number): string {
  const proxyUrl = process.env.EWYOUTUBE_PROXY_URL?.trim();
  const redacted = (proxyUrl
    ? output.replaceAll(proxyUrl, "[configured proxy]")
    : output
  )
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, "$1[credentials]@")
    .replace(/https?:\/\/\S+/gi, "[source URL]")
    .replace(/\/(?:private\/)?tmp\/ewyoutube-[^\s/]+/g, "[temporary directory]");
  const errorLine = redacted
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.includes("ERROR:"));

  if (errorLine) {
    return errorLine.replace(/^.*ERROR:\s*/, "").slice(0, 500);
  }
  return `The download process exited with code ${exitCode}`;
}

function serializeJob(job: DownloadJob): DownloadJobStatusResponse {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    bytesPerSecond: job.bytesPerSecond,
    etaSeconds: job.etaSeconds,
    error: job.error,
    fileUrl:
      ["ready", "serving"].includes(job.status)
        ? `/api/download/jobs/${encodeURIComponent(job.id)}/file`
        : undefined,
  };
}

function contentTypeFor(
  container: Container,
  isAudioOnly: boolean
): string {
  if (container === "mp3") return "audio/mpeg";
  if (container === "ogg") return "audio/ogg";
  if (container === "webm") {
    return isAudioOnly ? "audio/webm" : "video/webm";
  }
  return isAudioOnly ? "audio/mp4" : "video/mp4";
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseByteSize(value: string | undefined, fallback: number): number {
  const match = /^(\d+(?:\.\d+)?)\s*([KMGT])?B?$/i.exec(value?.trim() ?? "");
  if (!match) return fallback;

  const amount = Number(match[1]);
  const unit = match[2]?.toUpperCase();
  const multiplier =
    unit === "K"
      ? 1024
      : unit === "M"
        ? 1024 ** 2
        : unit === "G"
          ? 1024 ** 3
          : unit === "T"
            ? 1024 ** 4
            : 1;
  const bytes = Math.floor(amount * multiplier);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : fallback;
}
