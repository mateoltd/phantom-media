import { UpstreamError } from "../errors.ts";
import { runQuery } from "./gql.ts";

import { normalizeReplayNode, type ReplayNode } from "../chat/messages.ts";

export async function fetchVodComments(vodId: string, offset: number) {
  const data = await runQuery<{
    video: { comments: {
      edges: { node: ReplayNode }[];
      pageInfo: { hasNextPage: boolean };
    } | null } | null;
  }>(`query VideoComments($id: ID!, $offset: Int) {
    video(id: $id) {
      comments(contentOffsetSeconds: $offset) {
        edges {
          node {
            id
            contentOffsetSeconds
            commenter { id displayName login }
            message { fragments { text emote { id } } userColor userBadges { id version title imageURL } }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }`, { id: vodId, offset: Math.floor(offset) });
  if (!data.video) throw new UpstreamError("not-found");
  if (!data.video.comments) throw new UpstreamError("unavailable");
  const { edges, pageInfo } = data.video.comments;
  return {
    messages: edges.flatMap(({ node }) => { const message = normalizeReplayNode(node); return message ? [message] : []; }),
    coverage: { from: Math.floor(offset), through: edges.at(-1)?.node.contentOffsetSeconds ?? Math.floor(offset), partial: true,
      gapAt: pageInfo.hasNextPage && edges.length ? Math.floor(edges.at(-1)!.node.contentOffsetSeconds) : undefined },
    // Offset lookups overlap the prior batch; clients deduplicate by message ID.
    // Upstream cursor traversal is excluded; replay remains offset-first.
    nextOffset: pageInfo.hasNextPage && edges.length
      ? Math.max(Math.floor(offset) + 1, Math.floor(edges.at(-1)!.node.contentOffsetSeconds) + 1)
      : null,
  };
}
