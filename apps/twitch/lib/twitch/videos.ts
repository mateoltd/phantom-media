import { UpstreamError } from "../errors.ts";
import { runQuery } from "./gql.ts";

export interface MutedSegment {
  offset: number;
  duration: number;
}

export interface TwitchVideoData {
  id?: string;
  title?: string;
  broadcastType: string;
  createdAt: string;
  lengthSeconds?: number;
  previewThumbnailURL?: string;
  viewCount?: number;
  seekPreviewsURL?: string;
  language?: string;
  owner: { login: string };
  muteInfo?: { mutedSegmentConnection: { nodes: MutedSegment[] | null } | null } | null;
}

interface TwitchGQLResponse {
  data: {
    video: TwitchVideoData | null;
  };
}

export async function fetchVodMetadata(vodId: string): Promise<TwitchVideoData> {
  const data = await runQuery<TwitchGQLResponse["data"]>(
    `query VideoMetadata($id: ID!) {
      video(id: $id) {
        id
        title
        broadcastType
        createdAt
        lengthSeconds
        previewThumbnailURL(width: 1280, height: 720)
        viewCount
        seekPreviewsURL
        language
        owner { login }
        muteInfo { mutedSegmentConnection { nodes { offset duration } } }
      }
    }`,
    { id: vodId },
    { optionalErrorPath: ["video", "muteInfo"] },
  );

  if (!data.video) {
    throw new UpstreamError("not-found");
  }

  if (typeof data.video.broadcastType !== "string" || typeof data.video.createdAt !== "string" || typeof data.video.owner?.login !== "string") throw new UpstreamError("schema");
  return data.video;
}
