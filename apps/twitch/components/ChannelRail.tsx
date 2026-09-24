"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Info } from "@phosphor-icons/react/ssr";
import { channelRail } from "@/lib/home-feed";
import type { DiscoveryChannel } from "@/lib/discovery";
import { buildChannelPath } from "@/lib/validation";
import { HomeAvatar, HomeAvatarSkeleton } from "./HomeMediaTile";

const viewerCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

function CategoryArtwork({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <Image src={src} alt={name} width={96} height={128} unoptimized onError={() => setFailed(true)} />;
}

export function ChannelRail({ recent, suggestions, loading }: { recent: DiscoveryChannel[]; suggestions: DiscoveryChannel[]; loading: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [capacity, setCapacity] = useState(0);
  const [tooltip, setTooltip] = useState<{ channel: DiscoveryChannel; suggested: boolean; top: number } | null>(null);
  const [showTip, setShowTip] = useState(false);
  const tooltipId = useId();

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const horizontal = style.flexDirection === "row";
      const avatarSize = horizontal ? 52 : window.innerWidth <= 1000 ? 42 : 46;
      const gap = parseFloat(style.gap) || 0;
      const space = horizontal ? element.clientWidth - 4 : window.innerHeight - (parseFloat(style.top) || element.getBoundingClientRect().top) - 32;
      setCapacity(Math.max(0, Math.floor((space + gap - 8) / (avatarSize + gap))));
      setShowTip(false);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const channels = channelRail(recent, suggestions, capacity);
  function reveal(channel: DiscoveryChannel, suggested: boolean, trigger: HTMLElement) {
    const triggerRect = trigger.getBoundingClientRect();
    const railTop = root.current?.getBoundingClientRect().top ?? 0;
    const clearance = suggested ? 70 : 54;
    const center = Math.min(Math.max(triggerRect.top + triggerRect.height / 2, clearance), window.innerHeight - clearance);
    setTooltip({ channel, suggested, top: center - railTop });
    setShowTip(true);
  }
  const tooltipGame = tooltip?.channel.stream?.game ?? tooltip?.channel.broadcastSettings?.game;
  return <nav ref={root} className="twitch-home-channel-rail t-tt-group" aria-label="Your channels and recommendations" aria-busy={loading} onPointerLeave={() => setShowTip(false)} onKeyDown={(event) => { if (event.key === "Escape") setShowTip(false); }}>
    {loading ? Array.from({ length: capacity }, (_, index) => <HomeAvatarSkeleton key={index} />) : channels.map(({ channel, suggested }) => {
      const status = channel.stream ? "Live" : channel.stream === null ? "Offline" : "Recently watched";
      return <Link key={channel.login} href={buildChannelPath(channel.login)} className="twitch-home-rail-channel t-tt-trigger" aria-label={`${channel.displayName}, ${status}${channel.stream?.game?.name ? `, ${channel.stream.game.name}` : ""}`} aria-describedby={showTip && tooltip?.channel.login === channel.login ? tooltipId : undefined}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") reveal(channel, suggested, event.currentTarget); }} onFocus={(event) => reveal(channel, suggested, event.currentTarget)} onBlur={() => setShowTip(false)}>
        <HomeAvatar channel={channel} />
        <span className="twitch-home-rail-mobile-name">{channel.displayName}</span>
      </Link>;
    })}
    <span className="t-tt twitch-home-rail-tooltip" id={tooltipId} role="tooltip" aria-hidden={!showTip} data-show={showTip} data-has-reason={Boolean(tooltip?.suggested && tooltip.channel.recommendation?.reason)} style={{ top: tooltip?.top ?? 0 }}>
      {tooltipGame?.boxArtURL && <span className="twitch-home-tooltip-art"><CategoryArtwork key={tooltipGame.boxArtURL} src={tooltipGame.boxArtURL} name={tooltipGame.name} /></span>}
      <span className="t-tt-text">
        <strong className="twitch-home-tooltip-name">{tooltip?.channel.displayName}</strong>
        <span className="twitch-home-tooltip-status" data-live={Boolean(tooltip?.channel.stream)}>
          <span className="twitch-home-tooltip-status-dot" aria-hidden="true" />
          {tooltip?.channel.stream ? "Live now" : tooltip?.channel.stream === null ? "Offline" : "Recently watched"}
          {tooltip?.channel.stream && <span className="twitch-home-tooltip-viewers">{viewerCount.format(tooltip.channel.stream.viewersCount)} viewers</span>}
        </span>
        {tooltipGame && !tooltipGame.boxArtURL && <span className="twitch-home-tooltip-game-fallback">{tooltipGame.name}</span>}
        {tooltip?.suggested && tooltip.channel.recommendation?.reason && <span className="twitch-home-tooltip-reason"><Info size={14} aria-hidden="true" /><span>{tooltip.channel.recommendation.reason}</span></span>}
      </span>
    </span>
  </nav>;
}
