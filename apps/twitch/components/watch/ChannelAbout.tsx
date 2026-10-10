import Link from "next/link";
import type { TwitchChannelData } from "@/lib/contracts";

/** The channel in its own words. Always in the page, shown or not, so it is there for anyone reading the HTML. */
export function ChannelAbout({ channel }: { channel: TwitchChannelData }) {
  const stream = channel.stream;
  const game = stream?.game?.name;
  return <div className="twitch-channel-about">
    <h2 className="twitch-seo-subheading">About {channel.displayName}</h2>
    <p className="twitch-seo-body">{channel.description || `${channel.displayName} hasn’t written a bio.`}</p>
    {stream && <dl className="twitch-channel-facts">
      <div><dt>Streaming now</dt><dd>{stream.title}</dd></div>
      {game && <div><dt>Category</dt><dd><Link href={{ pathname: "/categories", query: { game } }} prefetch={false}>{game}</Link></dd></div>}
    </dl>}
  </div>;
}
