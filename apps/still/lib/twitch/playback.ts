import { tokenDiagnostics } from "../playback/diagnostics.ts";
import { UpstreamError } from "../errors.ts";
import { runQuery } from "./gql.ts";

export async function getPlaybackLocation(
  type: "live" | "vod",
  channelOrVod: string,
  signal?: AbortSignal
) {
  const data = await runQuery<{
    streamPlaybackAccessToken?: { value: string; signature: string };
    videoPlaybackAccessToken?: { value: string; signature: string };
  }>(
    `query PlaybackAccessToken($isLive: Boolean!, $login: String!, $isVod: Boolean!, $vodID: ID!) {
      streamPlaybackAccessToken(
        channelName: $login,
        params: {
          platform: "site",
          playerBackend: "mediaplayer",
          playerType: "embed"
        }
      ) @include(if: $isLive) {
        value
        signature
      }
      videoPlaybackAccessToken(
        id: $vodID,
        params: {
          platform: "site",
          playerBackend: "mediaplayer",
          playerType: "embed"
        }
      ) @include(if: $isVod) {
        value
        signature
      }
    }`,
    {
      isLive: type === "live",
      login: type === "live" ? channelOrVod : "",
      isVod: type === "vod",
      vodID: type === "vod" ? channelOrVod : "",
    },
    { signal }
  );

  const token =
    type === "live"
      ? data.streamPlaybackAccessToken
      : data.videoPlaybackAccessToken;

  if (!token) {
    throw new UpstreamError("unavailable");
  }

  const params = new URLSearchParams({
    allow_source: "true",
    allow_audio_only: "true",
    p: Math.floor(Math.random() * 999999).toString(),
    playlist_include_framerate: "true",
    sig: token.signature,
    supported_codecs: "h264",
    token: token.value,
  });

  const path =
    type === "live"
      ? `/api/v2/channel/hls/${encodeURIComponent(channelOrVod)}.m3u8`
      : `/vod/v2/${encodeURIComponent(channelOrVod)}.m3u8`;

  return { url: `https://usher.ttvnw.net${path}?${params.toString()}`, diagnostics: tokenDiagnostics(token.value) };
}
