import Link from "next/link";
import { Artwork } from "@phantom/ui";
import { buildChannelPath } from "@/lib/validation";

interface VodInfoProps {
  channel: string;
  channelDisplayName?: string;
  channelProfileImageURL?: string;
  broadcastType: string;
  title?: string;
  isLive?: boolean;
}

export function VodInfo({ channel, channelDisplayName, channelProfileImageURL, broadcastType, title, isLive = false }: VodInfoProps) {
  const typeLabel = isLive ? "Live" : broadcastType.toLowerCase() === "highlight" ? "Highlight" : broadcastType.toLowerCase() === "upload" ? "Upload" : "Past broadcast";
  const channelHref = buildChannelPath(channel);
  const label = channelDisplayName || channel;

  return (
    <div className="twitch-video-info">
      <h1 className="twitch-video-title">{title || label}</h1>
      <div className="twitch-video-byline">
        <Link href={channelHref} className="twitch-video-channel" aria-label={`Open ${label} channel`}>
          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-surface-light">
            <Artwork src={channelProfileImageURL} sizes="36px" fallback={<span className="flex h-full items-center justify-center text-sm">{label.charAt(0)}</span>} />
          </span>
          <span className="truncate">{label}</span>
        </Link>
        <span className={`twitch-broadcast-type ${isLive ? "twitch-broadcast-live" : ""}`}>{typeLabel}</span>
      </div>
    </div>
  );
}
