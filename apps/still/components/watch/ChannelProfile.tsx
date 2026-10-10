"use client";

import type { ReactNode } from "react";
import { Catalog } from "@/components/library/Catalog";
import type { ChannelData } from "@/lib/contracts";
import type { SliceReceipt } from "@/lib/catalog/contracts";
import { ChannelHeader } from "./ChannelHeader";
import { ChannelAbout } from "./ChannelAbout";

/**
 * A channel as it appears on its own page and under one of its videos: banner, name, then its videos, clips
 * and bio behind tabs. Under a video it is `linked` to the channel page and loads its videos only once it is
 * close to the screen, so watching a video does not cost a request for a list nobody scrolled to.
 */
export function ChannelProfile({ channel, videos, actions, linked = false, children }: {
  channel: ChannelData;
  videos?: Promise<SliceReceipt | null>;
  actions?: ReactNode;
  linked?: boolean;
  children?: ReactNode;
}) {
  return <section className="still-channel-profile" data-linked={linked || undefined} aria-label={`${channel.displayName} on Twitch`}>
    <ChannelHeader channel={channel} actions={actions} linked={linked} />
    {children}
    <Catalog scope={{ kind: "channel", anchor: channel.login }} initial={videos} lazy={linked}
      panels={[{ id: "about", label: "About", content: <ChannelAbout channel={channel} /> }]} />
  </section>;
}
