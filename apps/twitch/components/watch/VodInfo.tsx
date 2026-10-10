import Link from "next/link";
import { ChannelAvatar } from "../ChannelAvatar";
import { buildChannelPath } from "@/lib/validation";
import { GameController } from "@phosphor-icons/react/ssr";

interface VodInfoProps {
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  broadcastType: string;
  title?: string;
  isLive?: boolean;
  titleOnly?: boolean;
  /** A channel page is headed by the channel's name, so a stream title there sits one level down. */
  titleAs?: "h1" | "h2";
  category?: string;
  contentLabels?: readonly { id: string; name: string }[];
}

export function VodInfo({ channel, channelDisplayName, channelProfileImageURL, broadcastType, title, isLive = false, titleOnly = false, titleAs: Title = "h1", category, contentLabels }: VodInfoProps) {
  const typeLabel = isLive ? "Live" : broadcastType.toLowerCase() === "highlight" ? "Highlight" : broadcastType.toLowerCase() === "upload" ? "Upload" : "Past broadcast";
  const channelHref = buildChannelPath(channel);
  const label = channelDisplayName || channel;

  return (
    <div className="twitch-video-info">
      <Title className="twitch-video-title">{title || label}</Title>
      {!titleOnly && <div className="twitch-video-byline">
        <Link href={channelHref} className="twitch-video-channel" aria-label={`Open ${label} channel`}>
          <ChannelAvatar image={channelProfileImageURL} />
          <span className="truncate">{label}</span>
        </Link>
        <span className={`twitch-broadcast-type ${isLive ? "twitch-broadcast-live" : ""}`}>{typeLabel}</span>
      </div>}
      {category && <div className="twitch-video-context">
        <Link href={{ pathname: "/categories", query: { game: category } }} prefetch={false} className="twitch-video-category" aria-label={`Explore ${category} category`}><GameController size={16} aria-hidden="true" /><span>{category}</span></Link>
        {!!contentLabels?.length && <div className="twitch-content-labels" aria-label="Content labels">{contentLabels.map(label => <span key={label.id} className="twitch-content-label">{label.name}</span>)}</div>}
      </div>}
    </div>
  );
}
