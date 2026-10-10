import type { MediaVariant } from "../contracts.ts";
import { parseDownloadPlaylist, downloadHls, type DownloadPlaylist } from "./hls.ts";
import { downloadFile, type FileLocation } from "./file.ts";
import { readBytes } from "../media/read.ts";
import { browserMediaUrl } from "./urls.ts";
import { createSink } from "./sinks.ts";
import type { DownloadProgress, ProgressListener } from "./types.ts";

export interface PreparedDownload {
  variant: MediaVariant;
  playlist?: DownloadPlaylist;
  filename: string;
  mime: string;
}

/** Resolve the container and capture the media window before asking the user to save. */
export async function prepareDownload(variant: MediaVariant, filename: string, signal: AbortSignal): Promise<PreparedDownload> {
  let playlist: DownloadPlaylist | undefined;
  if (variant.delivery === "hls") {
    const response = await fetch(browserMediaUrl(variant.playlistUrl), { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
    const source = new URL(variant.playlistUrl, location.href);
    const base = response.headers.get("X-Phantom-Media-URL") ?? (source.origin === location.origin && response.url ? response.url : source.href);
    playlist = parseDownloadPlaylist(new TextDecoder().decode(await readBytes(response, 4 * 1024 * 1024, signal)), base);
  }
  signal.throwIfAborted();
  const extension = playlist?.extension ?? "mp4";
  return { variant, playlist, filename: `${filename}${playlist && !playlist.complete ? "_captured-window" : ""}.${extension}`, mime: extension === "ts" ? "video/mp2t" : "video/mp4" };
}

/** Called directly by the Save button: the picker must run before any network await. */
export async function downloadMedia(prepared: PreparedDownload, progress: ProgressListener, signal: AbortSignal, refresh?: () => Promise<FileLocation>) {
  signal.throwIfAborted();
  const sink = await createSink(prepared.filename, prepared.mime);
  let last: DownloadProgress = { phase: "fetching", downloaded: 0, total: 0, bytes: 0 };
  const report: ProgressListener = value => { last = value; progress(value); };
  try {
    signal.throwIfAborted();
    report(last);
    if (prepared.playlist) await downloadHls(prepared.playlist, sink, report, signal);
    else if (prepared.variant.delivery === "file") await downloadFile({ url: prepared.variant.playlistUrl, identity: prepared.variant.identity }, refresh, sink, report, signal);
    else throw new Error("Missing download playlist");
    signal.throwIfAborted();
    report({ ...last, phase: "finalizing" });
    await sink.close();
  } catch (error) { await sink.abort().catch(() => {}); throw error; }
}
