import { ResourceCache } from "../cache.ts";
import { UpstreamError } from "../errors.ts";
import { normalizePoll, type ChatPoll } from "../chat/polls.ts";
import { runQuery } from "./gql.ts";

export interface ChannelPoll { channelId: string; poll: ChatPoll | null }

// Everyone opening the same chat shares one upstream read.
const polls = new ResourceCache<ChannelPoll>(64);

/** The poll a signed-out viewer can see right now. Twitch keeps past polls for the broadcaster only. */
export function fetchChannelPoll(channel: string, signal?: AbortSignal): Promise<ChannelPoll> {
  if (!/^[a-z0-9_]{3,25}$/i.test(channel)) throw new UpstreamError("cap");
  const login = channel.toLowerCase();
  return polls.load(login, async () => {
    const data = await runQuery<{ user: { id: unknown; viewablePoll: unknown } | null }>(`
      query ChatPoll($login: String!) {
        user(login: $login) { id viewablePoll { id title status startedAt endedAt durationSeconds choices { id title votes { total } } } }
      }`, { login });
    if (!data.user) throw new UpstreamError("not-found");
    if (typeof data.user.id !== "string" || !/^\d{1,20}$/.test(data.user.id)) throw new UpstreamError("schema");
    const poll = normalizePoll(data.user.viewablePoll);
    return { channelId: data.user.id, poll: poll && poll.status !== "archived" ? poll : null };
  }, 5000, signal);
}
