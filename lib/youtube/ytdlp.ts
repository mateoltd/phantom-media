import { spawn } from "child_process";
import type { Container, DownloadOption, QueryResult } from "@/lib/types";
import { getYtDlpPath } from "@/lib/server/ytdlp";

interface YtDlpThumbnail {
  url?: string;
}

interface YtDlpFormat {
  format_id?: string;
  ext?: string;
  acodec?: string;
  vcodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  abr?: number;
  width?: number;
  height?: number;
  fps?: number;
  audio_channels?: number;
  asr?: number;
  language?: string;
  format_note?: string;
  protocol?: string;
}

interface YtDlpVideoData {
  id?: string;
  title?: string;
  channel?: string;
  channel_id?: string;
  uploader?: string;
  uploader_id?: string;
  duration?: number;
  view_count?: number;
  upload_date?: string;
  thumbnail?: string;
  thumbnails?: YtDlpThumbnail[];
  formats?: YtDlpFormat[];
}

interface YtDlpStreamShape {
  format_id: string;
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
}

const SUPPORTED_PROTOCOLS = new Set([
  "https",
  "http",
  "m3u8_native",
  "http_dash_segments",
  "https_dash_segments",
]);

export async function resolveVideoWithYtDlp(
  videoId: string
): Promise<QueryResult> {
  const data = await getYtDlpVideoData(videoId);

  return {
    kind: "video",
    title: data.title ?? "Video",
    videos: [
      {
        id: data.id ?? videoId,
        title: data.title ?? "Video",
        author: data.channel ?? data.uploader ?? "Unknown",
        authorId: data.channel_id ?? data.uploader_id ?? "",
        duration: data.duration ?? 0,
        thumbnailUrl: pickThumbnail(data, videoId),
        viewCount: data.view_count ?? undefined,
        uploadDate: formatUploadDate(data.upload_date),
      },
    ],
  };
}

export async function resolveDownloadOptionsWithYtDlp(
  videoId: string
): Promise<DownloadOption[]> {
  const data = await getYtDlpVideoData(videoId);
  const formats = (data.formats ?? []).filter(isSupportedMediaFormat);

  if (formats.length === 0) {
    throw new Error("No streaming data available for this video");
  }

  const muxedFormats = formats
    .filter((format) => hasAudio(format) && hasVideo(format))
    .map(toStreamShape)
    .filter(
      (format): format is YtDlpStreamShape =>
        Boolean(format && !format.isAudioOnly)
    );

  const videoFormats = formats
    .filter((format) => hasVideo(format) && !hasAudio(format))
    .map(toStreamShape)
    .filter(
      (format): format is YtDlpStreamShape =>
        Boolean(format && !format.isAudioOnly)
    );

  const audioFormats = formats
    .filter((format) => hasAudio(format) && !hasVideo(format))
    .map(toStreamShape)
    .filter(
      (format): format is YtDlpStreamShape =>
        Boolean(format && format.isAudioOnly)
    );

  const options: DownloadOption[] = [];

  for (const format of muxedFormats) {
    options.push({
      id: `muxed-${format.format_id}`,
      formatSpec: format.format_id,
      container: format.container,
      isAudioOnly: false,
      qualityLabel: format.qualityLabel ?? null,
      height: format.height ?? null,
      needsMuxing: false,
      streams: [
        {
          url: "",
          formatSpec: format.format_id,
          container: format.container,
          mimeType: format.mimeType,
          bitrate: format.bitrate,
          contentLength: format.contentLength,
          isAudioOnly: false,
          qualityLabel: format.qualityLabel,
          width: format.width,
          height: format.height,
          fps: format.fps,
        },
      ],
      totalSize: format.contentLength,
    });
  }

  for (const videoFormat of videoFormats) {
    const bestAudio = findBestAudio(audioFormats, videoFormat.container);
    if (!bestAudio) continue;

    options.push({
      id: `adaptive-${videoFormat.format_id}+${bestAudio.format_id}`,
      formatSpec: `${videoFormat.format_id}+${bestAudio.format_id}`,
      container: videoFormat.container,
      isAudioOnly: false,
      qualityLabel: videoFormat.qualityLabel ?? null,
      height: videoFormat.height ?? null,
      needsMuxing: true,
      streams: [
        {
          url: "",
          formatSpec: videoFormat.format_id,
          container: videoFormat.container,
          mimeType: videoFormat.mimeType,
          bitrate: videoFormat.bitrate,
          contentLength: videoFormat.contentLength,
          isAudioOnly: false,
          qualityLabel: videoFormat.qualityLabel,
          width: videoFormat.width,
          height: videoFormat.height,
          fps: videoFormat.fps,
        },
        {
          url: "",
          formatSpec: bestAudio.format_id,
          container: videoFormat.container,
          mimeType: bestAudio.mimeType,
          bitrate: bestAudio.bitrate,
          contentLength: bestAudio.contentLength,
          isAudioOnly: true,
          audioSampleRate: bestAudio.audioSampleRate,
          audioChannels: bestAudio.audioChannels,
          language: bestAudio.language,
        },
      ],
      totalSize: videoFormat.contentLength + bestAudio.contentLength,
    });
  }

  const bestWebmAudio = [...audioFormats]
    .filter((format) => format.container === "webm")
    .sort((a, b) => b.bitrate - a.bitrate)[0];

  const bestMp4Audio = [...audioFormats]
    .filter((format) => format.container === "mp4")
    .sort((a, b) => b.bitrate - a.bitrate)[0];

  if (bestWebmAudio) {
    const audioStream = {
      url: "",
      formatSpec: bestWebmAudio.format_id,
      container: "webm" as Container,
      mimeType: bestWebmAudio.mimeType,
      bitrate: bestWebmAudio.bitrate,
      contentLength: bestWebmAudio.contentLength,
      isAudioOnly: true,
      audioSampleRate: bestWebmAudio.audioSampleRate,
      audioChannels: bestWebmAudio.audioChannels,
      language: bestWebmAudio.language,
    };

    options.push({
      id: `audio-webm-${bestWebmAudio.format_id}`,
      formatSpec: bestWebmAudio.format_id,
      container: "webm",
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: false,
      streams: [audioStream],
      totalSize: audioStream.contentLength,
    });

    options.push({
      id: `audio-mp3-${bestWebmAudio.format_id}`,
      formatSpec: bestWebmAudio.format_id,
      container: "mp3",
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: true,
      streams: [audioStream],
      totalSize: audioStream.contentLength,
    });

    options.push({
      id: `audio-ogg-${bestWebmAudio.format_id}`,
      formatSpec: bestWebmAudio.format_id,
      container: "ogg",
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: true,
      streams: [audioStream],
      totalSize: audioStream.contentLength,
    });
  }

  if (bestMp4Audio) {
    options.push({
      id: `audio-mp4-${bestMp4Audio.format_id}`,
      formatSpec: bestMp4Audio.format_id,
      container: "mp4",
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: false,
      streams: [
        {
          url: "",
          formatSpec: bestMp4Audio.format_id,
          container: "mp4",
          mimeType: bestMp4Audio.mimeType,
          bitrate: bestMp4Audio.bitrate,
          contentLength: bestMp4Audio.contentLength,
          isAudioOnly: true,
          audioSampleRate: bestMp4Audio.audioSampleRate,
          audioChannels: bestMp4Audio.audioChannels,
          language: bestMp4Audio.language,
        },
      ],
      totalSize: bestMp4Audio.contentLength,
    });
  }

  return deduplicateOptions(options);
}

async function getYtDlpVideoData(videoId: string): Promise<YtDlpVideoData> {
  const stdout = await runYtDlp([
    "--dump-single-json",
    "--skip-download",
    "--no-playlist",
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);

  return JSON.parse(stdout) as YtDlpVideoData;
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getYtDlpPath(), ["--no-warnings", ...args]);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }

      if (!stdout.trim()) {
        reject(new Error("yt-dlp returned no data"));
        return;
      }

      resolve(stdout);
    });
  });
}

function isSupportedMediaFormat(format: YtDlpFormat): boolean {
  if (!format.format_id || !format.ext) return false;
  if (format.protocol && !SUPPORTED_PROTOCOLS.has(format.protocol)) return false;

  if (hasVideo(format)) {
    return format.ext === "mp4" || format.ext === "webm";
  }

  if (hasAudio(format)) {
    return format.ext === "m4a" || format.ext === "mp4" || format.ext === "webm";
  }

  return false;
}

function toStreamShape(format: YtDlpFormat): YtDlpStreamShape | null {
  const container = extToContainer(format.ext);
  const formatId = format.format_id;

  if (!container || !formatId) return null;

  const isAudioOnly = hasAudio(format) && !hasVideo(format);

  return {
    format_id: formatId,
    container,
    mimeType: buildMimeType(container, isAudioOnly),
    bitrate: Math.round((format.abr ?? format.tbr ?? 0) * 1000),
    contentLength: format.filesize ?? format.filesize_approx ?? 0,
    isAudioOnly,
    qualityLabel: isAudioOnly ? undefined : getQualityLabel(format),
    width: format.width,
    height: format.height,
    fps: format.fps,
    audioSampleRate: format.asr,
    audioChannels: format.audio_channels,
    language: format.language,
  };
}

function extToContainer(ext?: string): Container | null {
  if (ext === "mp4" || ext === "m4a") return "mp4";
  if (ext === "webm") return "webm";
  if (ext === "mp3") return "mp3";
  if (ext === "ogg" || ext === "opus") return "ogg";
  return null;
}

function buildMimeType(container: Container, isAudioOnly: boolean): string {
  if (isAudioOnly) {
    if (container === "mp4") return "audio/mp4";
    if (container === "webm") return "audio/webm";
    return `audio/${container}`;
  }

  return `video/${container}`;
}

function getQualityLabel(format: YtDlpFormat): string | undefined {
  if (format.height) {
    return `${format.height}p`;
  }

  const match = format.format_note?.match(/\d{3,4}p/);
  return match?.[0];
}

function hasAudio(format: YtDlpFormat): boolean {
  return Boolean(format.acodec && format.acodec !== "none");
}

function hasVideo(format: YtDlpFormat): boolean {
  return Boolean(format.vcodec && format.vcodec !== "none");
}

function pickThumbnail(data: YtDlpVideoData, videoId: string): string {
  const thumbnail =
    data.thumbnails?.[data.thumbnails.length - 1]?.url ?? data.thumbnail;
  return thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function formatUploadDate(value?: string): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function findBestAudio(
  audioFormats: YtDlpStreamShape[],
  preferredContainer: Container
): YtDlpStreamShape | undefined {
  const matching = audioFormats
    .filter((format) => format.container === preferredContainer)
    .sort((a, b) => b.bitrate - a.bitrate);

  if (matching.length > 0) {
    return matching[0];
  }

  return [...audioFormats].sort((a, b) => b.bitrate - a.bitrate)[0];
}

function deduplicateOptions(options: DownloadOption[]): DownloadOption[] {
  const seen = new Set<string>();
  const result: DownloadOption[] = [];

  for (const option of options) {
    const key = `${option.qualityLabel ?? "audio"}-${option.container}-${option.isAudioOnly}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }

  return result.sort(compareDownloadOptions);
}

const videoContainerOrder: Record<Container, number> = {
  mp4: 0,
  webm: 1,
  mp3: 2,
  ogg: 3,
};

const audioContainerOrder: Record<Container, number> = {
  mp3: 0,
  mp4: 1,
  ogg: 2,
  webm: 3,
};

function compareDownloadOptions(a: DownloadOption, b: DownloadOption): number {
  if (a.isAudioOnly !== b.isAudioOnly) {
    return a.isAudioOnly ? 1 : -1;
  }

  if (!a.isAudioOnly && !b.isAudioOnly) {
    const heightDiff = (b.height ?? 0) - (a.height ?? 0);
    if (heightDiff !== 0) return heightDiff;

    const containerDiff =
      videoContainerOrder[a.container] - videoContainerOrder[b.container];
    if (containerDiff !== 0) return containerDiff;

    if (a.needsMuxing !== b.needsMuxing) {
      return a.needsMuxing ? 1 : -1;
    }
  } else {
    const containerDiff =
      audioContainerOrder[a.container] - audioContainerOrder[b.container];
    if (containerDiff !== 0) return containerDiff;
  }

  return (b.totalSize ?? 0) - (a.totalSize ?? 0);
}
