import type { MediaVariant } from "../contracts.ts";
import { UpstreamError } from "../errors.ts";
import { generateMasterPlaylist, rewriteMediaPlaylist } from "./hls.ts";
import { readManifest } from "./manifest.ts";
import { isAudioVariant, videoVariants } from "./variants.ts";

export type PlaybackPlaylist = { kind: "playlist"; text: string } | { kind: "media-redirect"; quality: string };

/** A video ABR presentation and an explicit audio media source are separate. */
export async function playbackPlaylist(source: Record<string, string>, variants: MediaVariant[],
  mode: "video" | "audio", quality?: string | null, signal?: AbortSignal): Promise<PlaybackPlaylist> {
  const candidates = variants.filter(variant => variant.delivery === "hls");
  const tracks = mode === "audio" ? candidates.filter(isAudioVariant) : videoVariants(candidates);
  if (!tracks.length) throw new UpstreamError("unavailable");
  if (quality && !tracks.some(variant => variant.key === quality)) throw new UpstreamError("not-found");
  if (mode === "video" && !quality) {
    const master = generateMasterPlaylist(source, tracks);
    if (master.includes("#EXT-X-STREAM-INF:")) return { kind: "playlist", text: master };
    // Pin subsequent growing-playlist polls to a media URL. If optional
    // attributes arrive later, that URL must not change into a master playlist.
    return { kind: "media-redirect", quality: tracks[0].key };
  }
  // Unknown keyless attributes never become guessed ABR metadata. Select one
  // video media playlist instead; explicit audio always takes this same path.
  const selected = quality ? tracks.find(variant => variant.key === quality)! : tracks[0];
  const manifest = await readManifest(selected.playlistUrl, signal);
  return { kind: "playlist", text: rewriteMediaPlaylist(manifest.text, manifest.url ?? selected.playlistUrl, true) };
}
