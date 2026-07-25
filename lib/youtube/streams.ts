import type { Container, DownloadOption } from "@/lib/types";
import {
  CLIENT_FALLBACK_ORDER,
  withSessionRetry,
} from "@/lib/youtube/client";
import type { Innertube, Misc } from "youtubei.js";

type Format = Misc.Format;

const streamCache = new Map<
  string,
  { options: DownloadOption[]; expiresAt: number }
>();
const inFlightResolutions = new Map<string, Promise<DownloadOption[]>>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

export async function resolveDownloadOptions(
  videoId: string
): Promise<DownloadOption[]> {
  const cached = streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    streamCache.delete(videoId);
    streamCache.set(videoId, cached);
    return cached.options;
  }
  if (cached) streamCache.delete(videoId);

  const existingResolution = inFlightResolutions.get(videoId);
  if (existingResolution) return existingResolution;

  const resolution = withSessionRetry((yt) => tryAllClients(yt, videoId));
  inFlightResolutions.set(videoId, resolution);

  try {
    const options = await resolution;
    streamCache.set(videoId, {
      options,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    while (streamCache.size > CACHE_MAX_ENTRIES) {
      const oldestKey = streamCache.keys().next().value;
      if (!oldestKey) break;
      streamCache.delete(oldestKey);
    }

    return options;
  } finally {
    inFlightResolutions.delete(videoId);
  }
}

async function tryAllClients(
  yt: Innertube,
  videoId: string
): Promise<DownloadOption[]> {
  let lastError: Error | null = null;

  for (const client of CLIENT_FALLBACK_ORDER) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const streaming = info.streaming_data;

      if (!streaming) continue;

      const allFormats = [
        ...(streaming.formats ?? []),
        ...(streaming.adaptive_formats ?? []),
      ];

      if (allFormats.length === 0) continue;

      return buildDownloadOptions(allFormats);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("No streaming data available for this video");
}

function buildDownloadOptions(formats: Format[]): DownloadOption[] {
  const supported = formats.filter(isSupportedFormat);

  const muxedFormats = supported.filter((f) => f.has_video && f.has_audio);
  const videoFormats = supported.filter((f) => f.has_video && !f.has_audio);
  const audioFormats = supported.filter((f) => f.has_audio && !f.has_video);

  const options: DownloadOption[] = [];

  for (const format of muxedFormats) {
    const container = mimeToContainer(format.mime_type, false);
    if (!container) continue;

    options.push({
      id: `muxed-${format.itag}`,
      formatSpec: String(format.itag),
      container,
      isAudioOnly: false,
      qualityLabel: format.quality_label ?? null,
      height: format.height ?? null,
      needsMuxing: false,
      streams: [
        {
          url: "",
          formatSpec: String(format.itag),
          container,
          mimeType: format.mime_type,
          bitrate: format.bitrate ?? 0,
          contentLength: format.content_length ?? 0,
          isAudioOnly: false,
          qualityLabel: format.quality_label,
          width: format.width,
          height: format.height,
          fps: format.fps,
        },
      ],
      totalSize: format.content_length ?? 0,
    });
  }

  for (const videoFormat of videoFormats) {
    const container = mimeToContainer(videoFormat.mime_type, false);
    if (!container) continue;

    const bestAudio = findBestAudio(audioFormats, container);
    if (!bestAudio) continue;

    const audioContainer = mimeToContainer(bestAudio.mime_type, true);
    if (!audioContainer) continue;

    options.push({
      id: `adaptive-${videoFormat.itag}+${bestAudio.itag}`,
      formatSpec: `${videoFormat.itag}+${bestAudio.itag}`,
      container,
      isAudioOnly: false,
      qualityLabel: videoFormat.quality_label ?? null,
      height: videoFormat.height ?? null,
      needsMuxing: true,
      streams: [
        {
          url: "",
          formatSpec: String(videoFormat.itag),
          container,
          mimeType: videoFormat.mime_type,
          bitrate: videoFormat.bitrate ?? 0,
          contentLength: videoFormat.content_length ?? 0,
          isAudioOnly: false,
          qualityLabel: videoFormat.quality_label,
          width: videoFormat.width,
          height: videoFormat.height,
          fps: videoFormat.fps,
        },
        {
          url: "",
          formatSpec: String(bestAudio.itag),
          container,
          mimeType: bestAudio.mime_type,
          bitrate: bestAudio.bitrate ?? 0,
          contentLength: bestAudio.content_length ?? 0,
          isAudioOnly: true,
          audioSampleRate: bestAudio.audio_sample_rate,
          audioChannels: bestAudio.audio_channels,
          language: bestAudio.language ?? undefined,
        },
      ],
      totalSize:
        (videoFormat.content_length ?? 0) + (bestAudio.content_length ?? 0),
    });
  }

  const bestWebmAudio = audioFormats
    .filter((f) => f.mime_type.includes("webm"))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

  const bestMp4Audio = audioFormats
    .filter((f) => f.mime_type.includes("mp4"))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

  if (bestWebmAudio) {
    const audioStream = {
      url: "",
      formatSpec: String(bestWebmAudio.itag),
      container: "webm" as Container,
      mimeType: bestWebmAudio.mime_type,
      bitrate: bestWebmAudio.bitrate ?? 0,
      contentLength: bestWebmAudio.content_length ?? 0,
      isAudioOnly: true,
      audioSampleRate: bestWebmAudio.audio_sample_rate,
      audioChannels: bestWebmAudio.audio_channels,
      language: bestWebmAudio.language ?? undefined,
    };

    options.push({
      id: `audio-webm-${bestWebmAudio.itag}`,
      formatSpec: String(bestWebmAudio.itag),
      container: "webm",
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: false,
      streams: [audioStream],
      totalSize: audioStream.contentLength,
    });

  }

  if (bestMp4Audio) {
    options.push({
      id: `audio-mp4-${bestMp4Audio.itag}`,
      formatSpec: String(bestMp4Audio.itag),
      container: "mp4",
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: false,
      streams: [
        {
          url: "",
          formatSpec: String(bestMp4Audio.itag),
          container: "mp4",
          mimeType: bestMp4Audio.mime_type,
          bitrate: bestMp4Audio.bitrate ?? 0,
          contentLength: bestMp4Audio.content_length ?? 0,
          isAudioOnly: true,
          audioSampleRate: bestMp4Audio.audio_sample_rate,
          audioChannels: bestMp4Audio.audio_channels,
          language: bestMp4Audio.language ?? undefined,
        },
      ],
      totalSize: bestMp4Audio.content_length ?? 0,
    });
  }

  const conversionSource = bestWebmAudio ?? bestMp4Audio;
  if (conversionSource) {
    const sourceContainer = mimeToContainer(
      conversionSource.mime_type,
      true
    );
    if (sourceContainer) {
      const audioStream = {
        url: "",
        formatSpec: String(conversionSource.itag),
        container: sourceContainer,
        mimeType: conversionSource.mime_type,
        bitrate: conversionSource.bitrate ?? 0,
        contentLength: conversionSource.content_length ?? 0,
        isAudioOnly: true,
        audioSampleRate: conversionSource.audio_sample_rate,
        audioChannels: conversionSource.audio_channels,
        language: conversionSource.language ?? undefined,
      };

      for (const container of ["mp3", "ogg"] as const) {
        options.push({
          id: `audio-${container}-${conversionSource.itag}`,
          formatSpec: String(conversionSource.itag),
          container,
          isAudioOnly: true,
          qualityLabel: null,
          height: null,
          needsMuxing: true,
          streams: [audioStream],
          totalSize: audioStream.contentLength,
        });
      }
    }
  }

  return deduplicateOptions(options);
}

function isSupportedFormat(format: Format): boolean {
  const mime = format.mime_type;
  if (!mime) return false;

  if (format.has_video) {
    return mime.includes("mp4") || mime.includes("webm");
  }
  if (format.has_audio) {
    return (
      mime.includes("mp4") ||
      mime.includes("webm") ||
      mime.includes("mp4a") ||
      mime.includes("opus")
    );
  }
  return false;
}

function mimeToContainer(
  mime: string,
  isAudioOnly: boolean
): Container | null {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (isAudioOnly && mime.includes("opus")) return "webm";
  return null;
}

function findBestAudio(
  audioFormats: Format[],
  preferredContainer: Container
): Format | undefined {
  const preferredMime = preferredContainer === "mp4" ? "mp4" : "webm";
  const matching = audioFormats
    .filter((f) => f.mime_type.includes(preferredMime))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  return matching[0];
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
