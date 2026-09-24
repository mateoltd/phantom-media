import Link from "next/link";
import { ChannelAvatar } from "./ChannelAvatar";
import { buildChannelPath } from "@/lib/validation";

interface VodInfoProps {
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  broadcastType: string;
  title?: string;
  isLive?: boolean;
  titleOnly?: boolean;
}

export function VodInfo({ channel, channelDisplayName, channelProfileImageURL, broadcastType, title, isLive = false, titleOnly = false }: VodInfoProps) {
  const typeLabel = isLive ? "Live" : broadcastType.toLowerCase() === "highlight" ? "Highlight" : broadcastType.toLowerCase() === "upload" ? "Upload" : "Past broadcast";
  const channelHref = buildChannelPath(channel);
  const label = channelDisplayName || channel;

  return (
    <div className="twitch-video-info">
      <h1 className="twitch-video-title">{title || label}</h1>
      {!titleOnly && <div className="twitch-video-byline">
        <Link href={channelHref} className="twitch-video-channel" aria-label={`Open ${label} channel`}>
          <ChannelAvatar image={channelProfileImageURL} />
          <span className="truncate">{label}</span>
        </Link>
        <span className={`twitch-broadcast-type ${isLive ? "twitch-broadcast-live" : ""}`}>{typeLabel}</span>
      </div>}
    </div>
  );
}
