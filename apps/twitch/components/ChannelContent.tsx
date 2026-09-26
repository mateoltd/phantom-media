import Image from "next/image";
import Link from "next/link";
import type { TwitchChannelData } from "@/lib/twitch";
import { buildChannelPath } from "@/lib/validation";

/**
 * Server-rendered body for an indexable `/[channelName]` page. This is the
 * part a crawler sees: the channel's real name, its real bio, and real links.
 * The interactive player above it is client-rendered, so without this block
 * these pages would ship no content at all.
 */
export function ChannelContent({ channel }: { channel: TwitchChannelData }) {
  const isLive = Boolean(channel.stream);

  return (
    <section className="twitch-seo" aria-labelledby="twitch-channel-heading">
      <div className="twitch-seo-inner">
        <header className="twitch-seo-channel-head">
          {channel.profileImageURL ? (
            <Image
              src={channel.profileImageURL}
              alt=""
              width={72}
              height={72}
              unoptimized
              className="twitch-seo-avatar"
            />
          ) : null}
          <div className="min-w-0">
            <h1 id="twitch-channel-heading" className="twitch-seo-title">
              {channel.displayName}
            </h1>
            <p className="twitch-seo-handle">
              @{channel.login}
              <span className={`twitch-seo-status ${isLive ? "is-live" : ""}`}>
                {isLive ? "Live now" : "Offline"}
              </span>
            </p>
          </div>
        </header>

        {channel.stream ? (
          <p className="twitch-seo-lede">
            {channel.displayName} is live on Twitch right now. Watch the stream in
            Phantom Twitch with adaptive quality and live chat, or open the channel
            to browse their recent broadcasts.
          </p>
        ) : (
          <p className="twitch-seo-lede">
            {channel.displayName} is offline right now. Their recent broadcasts and
            past broadcasts are listed above in the player, or open the channel to
            watch the stream when it goes live.
          </p>
        )}

        {channel.description ? (
          <div className="twitch-seo-block">
            <h3 className="twitch-seo-subheading">About {channel.displayName}</h3>
            <p className="twitch-seo-body">{channel.description}</p>
          </div>
        ) : null}

        {channel.stream?.title ? (
          <div className="twitch-seo-block">
            <h3 className="twitch-seo-subheading">Streaming now</h3>
            <p className="twitch-seo-body">
              {channel.stream.title}
              {channel.stream.game?.name ? ` — ${channel.stream.game.name}` : ""}
            </p>
          </div>
        ) : null}

        {/* No VOD list here on purpose: the app above already renders a
            "Recent broadcasts" grid, and VOD pages are noindex, so repeating
            the titles would duplicate the page for readers and buy nothing
            from crawlers. The bio and live state are the unique content. */}

        <p className="twitch-seo-body">
          <Link href={buildChannelPath(channel.login)} className="twitch-seo-link">
            Open the {channel.displayName} player
          </Link>
          {" · "}
          <Link href="/" className="twitch-seo-link">
            Browse more channels
          </Link>
        </p>
      </div>
    </section>
  );
}
