"use client";

import { Artwork } from "@phantom/ui";

export function ChannelAvatar({ image }: { image?: string }) {
  return (
    <span className="twitch-channel-avatar" aria-hidden="true">
      <Artwork src={image} sizes="36px" />
    </span>
  );
}
