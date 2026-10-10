import { UpstreamError } from "../errors.ts";
import { runQuery } from "./gql.ts";
import type { TwitchChannelData } from "../contracts.ts";
import { channelIndex } from "../search/registry.ts";
import { observedChannel } from "../search/contracts.ts";

export async function fetchChannelBasics(login: string): Promise<TwitchChannelData> {
  const data = await runQuery<{ user: TwitchChannelData | null }>(`query ChannelBasics($login: String!) {
    user(login: $login) { id login displayName description profileImageURL(width: 300)
      bannerImageURL followers { totalCount } roles { isPartner }
      stream { id title type viewersCount createdAt game { name } archiveVideo { id } } }
  }`, { login });
  if (!data.user) throw new UpstreamError("not-found");
  channelIndex.put([observedChannel(data.user)]);
  return data.user;
}
