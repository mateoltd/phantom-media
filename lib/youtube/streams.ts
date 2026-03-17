import type { Container, DownloadOption } from "@/lib/types";
import { getInnertube, CLIENT_FALLBACK_ORDER } from "@/lib/youtube/client";
import type { Misc } from "youtubei.js";

type Format = Misc.Format;

/**
 * Resolves all available download options using youtubei.js directly.
 * Tries multiple InnerTube client types to work around bot detection on
 * servers whose ASN range has been flagged by YouTube.
 */
export async function resolveDownloadOptions(
  videoId: string
): Promise<DownloadOption[]> {
  const yt = await getInnertube();
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
      // Try next client type
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

  // Muxed formats (video+audio in one stream)
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

  // Adaptive video + best audio
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

  // Audio-only options
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

    options.push({
      id: `audio-mp3-${bestWebmAudio.itag}`,
      formatSpec: String(bestWebmAudio.itag),
      container: "mp3",
      isAudioOnly: true,
      qualityLabel: null,
      height: null,
      needsMuxing: true,
      streams: [audioStream],
      totalSize: audioStream.contentLength,
    });

    options.push({
      id: `audio-ogg-${bestWebmAudio.itag}`,
      formatSpec: String(bestWebmAudio.itag),
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

  if (matching.length > 0) return matching[0];
  return [...audioFormats].sort(
    (a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0)
  )[0];
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
