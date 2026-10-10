"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { formatCount } from "@/lib/format";
import { buildChannelPath } from "@/lib/validation";
import type { TwitchChannelData as ChannelData } from "@/lib/contracts";

/**
 * The channel's banner as a strip, with its round picture set a little in from the left and clipped onto the
 * banner's lower edge. `linked` is for pages about something else (a video): the name leads to the channel
 * and sits one heading level down.
 */
export function ChannelHeader({ channel, actions, linked = false }: { channel: ChannelData; actions?: ReactNode; linked?: boolean }) {
  const [failedBanner, setFailedBanner] = useState<string>();
  const banner = channel.bannerImageURL && channel.bannerImageURL !== failedBanner ? channel.bannerImageURL : undefined;
  const followers = channel.followers?.totalCount;
  const Name = linked ? "h2" : "h1";
  const href = buildChannelPath(channel.login);
  const portrait = <Image src={channel.profileImageURL} alt="" width={96} height={96} unoptimized priority={!linked} className="twitch-channel-portrait" />;
  const name = <>
    <span className="truncate">{channel.displayName}</span>
    {channel.roles?.isPartner && <VerifiedBadge size={20} />}
  </>;

  return (
    <header className="twitch-channel-header" data-banner={banner ? "" : undefined}>
      {banner && <div className="twitch-channel-banner">
        <Image src={banner} alt="" fill sizes="100vw" unoptimized priority={!linked} onError={() => setFailedBanner(banner)} />
      </div>}
      <div className="twitch-channel-identity">
        {linked ? <Link href={href} className="twitch-channel-portrait-link" tabIndex={-1} aria-hidden="true">{portrait}</Link> : portrait}
        <div className="twitch-channel-names">
          <div className="twitch-channel-title">
            <Name className="twitch-channel-name">{linked ? <Link href={href} className="twitch-channel-name-link">{name}</Link> : name}</Name>
            <span className={`twitch-broadcast-type ${channel.stream ? "twitch-broadcast-live" : ""}`}>{channel.stream ? "Live" : "Offline"}</span>
          </div>
          <p className="twitch-channel-meta">
            <span className="twitch-channel-handle">@{channel.login}</span>
            {typeof followers === "number" && <span className="twitch-channel-followers"><strong>{formatCount(followers)}</strong> followers</span>}
          </p>
        </div>
        {actions && <div className="twitch-watch-actions">{actions}</div>}
      </div>
    </header>
  );
}
