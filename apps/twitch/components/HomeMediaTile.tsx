"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { ProgressRail } from "@phantom/ui";
import { Play } from "@phosphor-icons/react/ssr";
import { useLocalStorage } from "@/lib/hooks";
import { formatTime } from "@/lib/format";
import { buildChannelPath } from "@/lib/validation";
import { historyPreview, type DiscoveryChannel } from "@/lib/discovery";
import { isCurrentBroadcast } from "@/lib/home-feed";
import type { HistoryEntry } from "./History";

export function HomeAvatar({ channel }: { channel: DiscoveryChannel }) {
  return <span className="twitch-home-avatar-wrap" data-offline={channel.stream === null || undefined}>
    <AvatarImage key={channel.profileImageURL || channel.login} channel={channel} />
  </span>;
}

function AvatarImage({ channel }: { channel: DiscoveryChannel }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ready = !channel.profileImageURL || loaded || failed;
  return <span className={`twitch-home-avatar t-skel${ready ? " is-revealed" : ""}`}>
    <span className="t-skel-skeleton" aria-hidden="true"><Skeleton circle height="100%" enableAnimation={!ready} /></span>
    <span className="t-skel-content twitch-home-avatar-content">
      {channel.profileImageURL && !failed ? <Image src={channel.profileImageURL} alt="" fill sizes="48px" unoptimized onLoad={() => setLoaded(true)} onError={() => setFailed(true)} /> : channel.displayName.slice(0, 1).toUpperCase()}
    </span>
  </span>;
}

export function HomeAvatarSkeleton() {
  return <span className="twitch-home-avatar-wrap" aria-hidden="true"><Skeleton circle height="100%" /></span>;
}

function Thumbnail({ image, channel }: { image?: string; channel: DiscoveryChannel }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ready = !image || loaded || failed;
  return <span className={`twitch-home-thumbnail t-skel${ready ? " is-revealed" : ""}`}>
    <span className="t-skel-skeleton" aria-hidden="true"><Skeleton height="100%" borderRadius={0} enableAnimation={!ready} /></span>
    <span className="t-skel-content">
      {image && !failed ? <Image src={image} alt="" fill unoptimized sizes="(max-width: 640px) 90vw, (max-width: 1280px) 43vw, 578px" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
        : <span className="twitch-home-art-fallback"><HomeAvatar channel={channel} /></span>}
    </span>
  </span>;
}

export function HomeTileSkeleton() {
  return <div className="twitch-home-tile twitch-home-tile-skeleton" aria-hidden="true">
    <span className="media-tile-art twitch-home-art"><Skeleton height="100%" borderRadius={0} /></span>
    <span className="twitch-home-tile-meta">
      <span className="twitch-home-avatar-wrap"><Skeleton circle height="100%" /></span>
      <span className="twitch-home-tile-copy"><Skeleton width="88%" height={15} /><Skeleton width="42%" height={12} /></span>
    </span>
  </div>;
}

function TileContents({ channel, title, image, live = false, progress, resumeLabel }: {
  channel: DiscoveryChannel; title: string; image?: string; live?: boolean; progress?: number; resumeLabel?: string;
}) {
  return <>
    <span className="media-tile-art twitch-home-art">
      <Thumbnail key={image || "fallback"} image={image} channel={channel} />
      <span className="media-tile-play twitch-home-play" aria-hidden="true"><Play size={32} weight="fill" /></span>
      {live && channel.stream && <span className="twitch-home-live" aria-label={`Live, ${channel.stream.viewersCount.toLocaleString("en")} viewers`}>Live <span>{new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(channel.stream.viewersCount)}</span></span>}
      {progress !== undefined && <ProgressRail slim percent={progress} label={resumeLabel || "Watch progress"} className="twitch-resume-progress" />}
    </span>
    <span className="twitch-home-tile-meta">
      <HomeAvatar channel={channel} />
      <span className="twitch-home-tile-copy">
        <span className="twitch-home-art-title">{title}</span>
        <span className="twitch-home-tile-channel">{channel.displayName}</span>
      </span>
    </span>
  </>;
}

export function ResumeTile({ entry, channel, onSelect }: { entry: HistoryEntry; channel?: DiscoveryChannel; onSelect: (id: string) => void }) {
  const [seconds] = useLocalStorage<number>(`phantom-playback:${entry.vodId}`, 0);
  const resume = typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const progress = resume && entry.lengthSeconds && entry.lengthSeconds > 0 ? Math.min(100, resume / entry.lengthSeconds * 100) : undefined;
  const resumeLabel = resume ? `Resume at ${formatTime(resume)}` : "Resume watching";
  const owner = channel ?? { id: entry.channel, login: entry.channel, displayName: entry.channel };
  const live = isCurrentBroadcast(entry, channel);
  return <button type="button" className="twitch-home-tile media-tile-hit" onClick={() => onSelect(entry.vodId)} aria-label={`${entry.title || entry.channel}, ${live ? "live, " : ""}${resumeLabel}`} title={`${entry.title || entry.channel}: ${resumeLabel}`}>
    <TileContents channel={owner} title={entry.title || entry.channel} image={historyPreview(entry, channel)} live={live} progress={progress} resumeLabel={resumeLabel} />
  </button>;
}

export function RecommendedTile({ channel }: { channel: DiscoveryChannel }) {
  return <Link className="twitch-home-tile media-tile-hit" href={buildChannelPath(channel.login)} title={`${channel.stream?.title || channel.displayName}\n${channel.recommendation?.reason || ""}`} aria-label={`${channel.displayName}, live, ${channel.stream?.title || ""}. ${channel.recommendation?.reason || ""}`}>
    <TileContents channel={channel} title={channel.stream?.title || channel.displayName} image={channel.stream?.previewImageURL} live />
  </Link>;
}
