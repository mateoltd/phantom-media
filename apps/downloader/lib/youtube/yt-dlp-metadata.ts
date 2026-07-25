import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import type {
  Container,
  DownloadOption,
  QueryResult,
  QueryResultKind,
  StreamInfo,
  VideoInfo,
} from "@/lib/types";
import {
  getProxyCandidates,
  hasConfiguredProxySource,
  isBotChallenge,
  isDirectProxyFallbackAllowed,
  isRetryableProxyFailure,
  redactProxySecrets,
  reportProxyFailure,
  reportProxySuccess,
  waitForProxySlot,
} from "@/lib/server/proxy-pool";
import { appendYouTubeRuntimeArgs } from "@/lib/youtube/yt-dlp-runtime";

const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_DIAGNOSTIC_BYTES = 4_000;
const METADATA_ATTEMPT_TIMEOUT_MS = 12_000;
const METADATA_TOTAL_TIMEOUT_MS = 45_000;
const VIDEO_EXTRACTION_CACHE_TTL_MS = 10 * 60 * 1000;
const VIDEO_EXTRACTION_CACHE_MAX_ENTRIES = 100;

interface YtDlpFormat {
  format_id?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  width?: number;
  height?: number;
  fps?: number;
  tbr?: number;
  abr?: number;
  asr?: number;
  audio_channels?: number;
  language?: string;
  filesize?: number;
  filesize_approx?: number;
  format_note?: string;
}

interface YtDlpEntry {
  id?: string;
  title?: string;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  channel_id?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
  view_count?: number;
  upload_date?: string;
  formats?: YtDlpFormat[];
  entries?: YtDlpEntry[];
}

interface VideoExtraction {
  result: QueryResult;
  options: DownloadOption[];
}

const videoExtractionCache = new Map<
  string,
  { extraction: VideoExtraction; expiresAt: number }
>();
const videoExtractionsInFlight = new Map<string, Promise<VideoExtraction>>();

export async function resolveVideoWithYtDlp(
  videoId: string
): Promise<QueryResult> {
  return (await extractVideoWithYtDlp(videoId)).result;
}

export async function searchWithYtDlp(
  query: string,
  limit: number
): Promise<QueryResult> {
  const info = await runYtDlpJson(`ytsearch${limit}:${query}`, [
    "--flat-playlist",
    "--playlist-end",
    String(limit),
  ]);
  const videos = toVideoList(info.entries, limit);
  return { kind: "search", title: `Search: ${query}`, videos };
}

export async function resolveCollectionWithYtDlp(
  target: string,
  kind: Extract<QueryResultKind, "playlist" | "channel">,
  limit: number
): Promise<QueryResult> {
  const info = await runYtDlpJson(target, [
    "--flat-playlist",
    "--playlist-end",
    String(limit),
  ]);
  return {
    kind,
    title: info.title?.trim() || (kind === "playlist" ? "Playlist" : "Channel"),
    videos: toVideoList(info.entries, limit),
  };
}

export async function resolveDownloadOptionsWithYtDlp(
  videoId: string
): Promise<DownloadOption[]> {
  return (await extractVideoWithYtDlp(videoId)).options;
}

export function primeVideoExtractionWithYtDlp(
  videoId: string
): Promise<void> {
  return extractVideoWithYtDlp(videoId).then(() => undefined);
}

async function extractVideoWithYtDlp(
  videoId: string
): Promise<VideoExtraction> {
  const cached = videoExtractionCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    videoExtractionCache.delete(videoId);
    videoExtractionCache.set(videoId, cached);
    return cached.extraction;
  }
  if (cached) videoExtractionCache.delete(videoId);

  const existing = videoExtractionsInFlight.get(videoId);
  if (existing) return existing;

  const extraction = extractVideoWithYtDlpUncached(videoId);
  videoExtractionsInFlight.set(videoId, extraction);

  try {
    const result = await extraction;
    videoExtractionCache.set(videoId, {
      extraction: result,
      expiresAt: Date.now() + VIDEO_EXTRACTION_CACHE_TTL_MS,
    });
    while (
      videoExtractionCache.size > VIDEO_EXTRACTION_CACHE_MAX_ENTRIES
    ) {
      const oldestKey = videoExtractionCache.keys().next().value;
      if (!oldestKey) break;
      videoExtractionCache.delete(oldestKey);
    }
    return result;
  } finally {
    videoExtractionsInFlight.delete(videoId);
  }
}

async function extractVideoWithYtDlpUncached(
  videoId: string
): Promise<VideoExtraction> {
  const info = await runYtDlpJson(
    `https://www.youtube.com/watch?v=${videoId}`,
    ["--no-playlist"]
  );
  const video = toVideoInfo(info, videoId);
  return {
    result: { kind: "video", title: video.title, videos: [video] },
    options: buildDownloadOptions(info.formats ?? []),
  };
}

async function runYtDlpJson(
  target: string,
  extraArgs: string[]
): Promise<YtDlpEntry> {
  let proxyCandidates: Array<string | undefined>;
  if (hasConfiguredProxySource()) {
    try {
      proxyCandidates = await getProxyCandidates();
    } catch (error) {
      if (!isDirectProxyFallbackAllowed()) throw error;
      proxyCandidates = [undefined];
    }
  } else {
    proxyCandidates = [undefined];
  }

  if (proxyCandidates.length === 0 && isDirectProxyFallbackAllowed()) {
    proxyCandidates = [undefined];
  }
  if (proxyCandidates.length === 0) {
    throw new Error("No healthy proxy exit is currently available");
  }

  let lastDiagnostic = "";
  let sawBotChallenge = false;
  const deadline =
    Date.now() +
    readPositiveInteger(
      process.env.YT_DLP_METADATA_TOTAL_TIMEOUT_MS,
      METADATA_TOTAL_TIMEOUT_MS
    );
  for (const [index, proxyUrl] of proxyCandidates.entries()) {
    if (proxyUrl) await waitForProxySlot(proxyUrl);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      lastDiagnostic = "ERROR: The metadata request exhausted its retry budget";
      break;
    }

    const args = [
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "--no-colors",
      "--js-runtimes",
      "node",
      "--socket-timeout",
      "7",
      "--retries",
      "0",
      "--extractor-retries",
      "0",
      ...extraArgs,
    ];
    appendYouTubeRuntimeArgs(args);
    if (proxyUrl) args.push("--proxy", proxyUrl);
    args.push("--", target);

    const result = await executeYtDlp(
      args,
      Math.min(
        readPositiveInteger(
          process.env.YT_DLP_METADATA_ATTEMPT_TIMEOUT_MS,
          METADATA_ATTEMPT_TIMEOUT_MS
        ),
        remainingMs
      )
    );
    lastDiagnostic = result.diagnostic;
    if (result.exitCode === 0) {
      try {
        const parsed = JSON.parse(result.stdout) as YtDlpEntry;
        if (proxyUrl) reportProxySuccess(proxyUrl);
        return parsed;
      } catch {
        throw new Error("The media extractor returned invalid metadata");
      }
    }

    const botChallenge = isBotChallenge(result.diagnostic);
    sawBotChallenge ||= botChallenge;
    const retryable = isRetryableProxyFailure(result.diagnostic);
    if (proxyUrl && retryable) {
      reportProxyFailure(
        proxyUrl,
        botChallenge ? "challenge" : "transient"
      );
    }
    const canRotate =
      Boolean(proxyUrl) &&
      index < proxyCandidates.length - 1 &&
      retryable;
    if (!canRotate) break;
  }

  if (sawBotChallenge) {
    throw new Error(
      "YouTube temporarily rejected all available routes. Please retry shortly."
    );
  }
  throw new Error(extractSafeError(lastDiagnostic));
}

async function executeYtDlp(
  args: string[],
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; diagnostic: string }> {
  const executable = process.env.YT_DLP_PATH ?? "yt-dlp";
  const child = spawn(executable, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    env: { ...process.env, NO_COLOR: "1" },
  });

  let stdout = "";
  let diagnostic = "";
  let outputExceeded = false;
  child.stdout?.on("data", (chunk: Buffer) => {
    if (outputExceeded) return;
    stdout += chunk.toString("utf8");
    if (Buffer.byteLength(stdout) > MAX_JSON_BYTES) {
      outputExceeded = true;
      terminateProcess(child);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    diagnostic = `${diagnostic}${chunk.toString("utf8")}`.slice(
      -MAX_DIAGNOSTIC_BYTES
    );
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    terminateProcess(child);
  }, timeoutMs);
  timeout.unref();

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? 1));
    });
    if (timedOut) {
      return {
        exitCode: 1,
        stdout,
        diagnostic: `${diagnostic}\nERROR: The metadata request timed out`,
      };
    }
    if (outputExceeded) throw new Error("The metadata response was too large");
    return { exitCode, stdout, diagnostic };
  } finally {
    clearTimeout(timeout);
  }
}

function toVideoList(
  entries: YtDlpEntry[] | undefined,
  limit: number
): VideoInfo[] {
  return (entries ?? [])
    .filter((entry) => Boolean(entry.id && entry.title))
    .slice(0, limit)
    .map((entry) => toVideoInfo(entry, entry.id!));
}

function toVideoInfo(info: YtDlpEntry, fallbackId: string): VideoInfo {
  const id = info.id?.trim() || fallbackId;
  const thumbnails = info.thumbnails ?? [];
  return {
    id,
    title: info.title?.trim() || "Untitled video",
    author:
      info.channel?.trim() || info.uploader?.trim() || "Unknown",
    authorId:
      info.channel_id?.trim() || info.uploader_id?.trim() || "",
    duration: Math.max(0, Math.floor(info.duration ?? 0)),
    thumbnailUrl:
      info.thumbnail ||
      thumbnails[thumbnails.length - 1]?.url ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    viewCount: info.view_count,
    uploadDate: info.upload_date,
  };
}

function buildDownloadOptions(formats: YtDlpFormat[]): DownloadOption[] {
  const supported = formats
    .filter((format) => /^\d+$/.test(format.format_id ?? ""))
    .map((format) => ({
      ...format,
      hasVideo: Boolean(format.vcodec && format.vcodec !== "none"),
      hasAudio: Boolean(format.acodec && format.acodec !== "none"),
      container: formatContainer(format),
      size: Math.max(0, format.filesize ?? format.filesize_approx ?? 0),
    }))
    .filter((format) => format.container && (format.hasVideo || format.hasAudio));

  const muxed = supported.filter((format) => format.hasVideo && format.hasAudio);
  const videoOnly = supported.filter(
    (format) => format.hasVideo && !format.hasAudio
  );
  const audioOnly = supported.filter(
    (format) => format.hasAudio && !format.hasVideo
  );
  const options: DownloadOption[] = [];

  for (const format of muxed) {
    const container = format.container!;
    const stream = toStreamInfo(format, container, false);
    options.push({
      id: `muxed-${format.format_id}`,
      formatSpec: format.format_id,
      container,
      isAudioOnly: false,
      qualityLabel: qualityLabel(format),
      height: format.height ?? null,
      needsMuxing: false,
      streams: [stream],
      totalSize: format.size,
    });
  }

  for (const video of videoOnly) {
    const container = video.container!;
    const audio = bestAudio(audioOnly, container);
    if (!audio) continue;
    const videoStream = toStreamInfo(video, container, false);
    const audioStream = toStreamInfo(audio, audio.container!, true);
    options.push({
      id: `adaptive-${video.format_id}+${audio.format_id}`,
      formatSpec: `${video.format_id}+${audio.format_id}`,
      container,
      isAudioOnly: false,
      qualityLabel: qualityLabel(video),
      height: video.height ?? null,
      needsMuxing: true,
      streams: [videoStream, audioStream],
      totalSize: video.size + audio.size,
    });
  }

  const webmAudio = bestAudio(audioOnly, "webm");
  const mp4Audio = bestAudio(audioOnly, "mp4");
  for (const audio of [webmAudio, mp4Audio]) {
    if (!audio) continue;
    const container = audio.container!;
    const stream = toStreamInfo(audio, container, true);
    options.push({
      id: `audio-${container}-${audio.format_id}`,
      formatSpec: audio.format_id,
      container,
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: false,
      streams: [stream],
      totalSize: audio.size,
    });
  }

  const conversionSource = webmAudio ?? mp4Audio;
  if (conversionSource) {
    const stream = toStreamInfo(
      conversionSource,
      conversionSource.container!,
      true
    );
    for (const container of ["mp3", "ogg"] as const) {
      options.push({
        id: `audio-${container}-${conversionSource.format_id}`,
        formatSpec: conversionSource.format_id,
        container,
        isAudioOnly: true,
        qualityLabel: null,
        height: null,
        needsMuxing: true,
        streams: [stream],
        totalSize: conversionSource.size,
      });
    }
  }

  return deduplicateOptions(options);
}

function formatContainer(format: YtDlpFormat): Container | null {
  if (format.ext === "mp4" || format.ext === "m4a") return "mp4";
  if (format.ext === "webm") return "webm";
  return null;
}

function bestAudio(
  formats: Array<
    YtDlpFormat & {
      container: Container | null;
      size: number;
    }
  >,
  container: Container
) {
  return formats
    .filter((format) => format.container === container)
    .sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];
}

function toStreamInfo(
  format: YtDlpFormat & { size: number },
  container: Container,
  isAudioOnly: boolean
): StreamInfo {
  return {
    url: "",
    formatSpec: format.format_id,
    container,
    mimeType: `${isAudioOnly ? "audio" : "video"}/${format.ext === "m4a" ? "mp4" : format.ext}`,
    bitrate: Math.round((format.tbr ?? format.abr ?? 0) * 1000),
    contentLength: format.size,
    isAudioOnly,
    qualityLabel: isAudioOnly ? undefined : qualityLabel(format) ?? undefined,
    width: format.width,
    height: format.height,
    fps: format.fps,
    audioSampleRate: format.asr,
    audioChannels: format.audio_channels,
    language: format.language,
  };
}

function qualityLabel(format: YtDlpFormat): string | null {
  if (format.height) return `${format.height}p`;
  return format.format_note?.trim() || null;
}

function deduplicateOptions(options: DownloadOption[]): DownloadOption[] {
  const seen = new Set<string>();
  return options
    .filter((option) => {
      const key = `${option.qualityLabel ?? "audio"}-${option.container}-${option.isAudioOnly}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (a.isAudioOnly !== b.isAudioOnly) return a.isAudioOnly ? 1 : -1;
      return (b.height ?? 0) - (a.height ?? 0) || b.totalSize - a.totalSize;
    });
}

function extractSafeError(diagnostic: string): string {
  const safe = redactProxySecrets(diagnostic)
    .replace(/https?:\/\/\S+/gi, "[source URL]")
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.includes("ERROR:"));
  return safe
    ? safe.replace(/^.*ERROR:\s*/, "").slice(0, 500)
    : "The media metadata request failed";
}

function terminateProcess(child: ChildProcess): void {
  if (!child.pid || child.killed) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
