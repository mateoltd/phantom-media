import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DebugVideoScript } from "@/components/DebugVideoScript";
import { VodApp } from "@/components/VodApp";
import { VodLoading } from "@/components/VodLoading";
import { ChannelContent } from "@/components/ChannelContent";
import { StructuredData } from "@/components/structured-data";
import {
  buildChannelDescription,
  isValidChannelName,
  loadChannelPage,
  normalizeChannelName,
} from "@/lib/channel-page";
import { isDebugEnabled } from "@/lib/debug";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

type ChannelPageProps = {
  params: Promise<{ channelName: string }>;
};

export async function generateMetadata({
  params,
}: ChannelPageProps): Promise<Metadata> {
  const { channelName } = await params;
  const login = normalizeChannelName(channelName);

  if (!isValidChannelName(login)) {
    return buildMetadata({
      title: "Channel Not Found",
      description: "That Twitch channel does not exist on Phantom Twitch.",
      path: `/${channelName}`,
      noIndex: true,
    });
  }

  const result = await loadChannelPage(login);

  // Confirmed gone: say so, and keep it out of the index.
  if (result.status === "missing") {
    return buildMetadata({
      title: "Channel Not Found",
      description: "That Twitch channel does not exist on Phantom Twitch.",
      path: `/${login}`,
      noIndex: true,
    });
  }

  // A transient Twitch failure must not deindex a real channel, so fall back to
  // generic-but-indexable metadata rather than noindex.
  if (result.status === "error") {
    return buildMetadata({
      title: `Watch ${login} on Twitch`,
      description: buildMetadataFallbackDescription(login),
      path: `/${login}`,
    });
  }

  const { channel } = result;
  const isLive = Boolean(channel.stream);
  const title = isLive
    ? `${channel.displayName} is live on Twitch`
    : `Watch ${channel.displayName} on Twitch`;

  return buildMetadata({
    title,
    description: buildChannelDescription(channel),
    path: `/${channel.login}`,
    keywords: [
      `${channel.displayName} twitch`,
      `watch ${channel.displayName} live`,
      `${channel.displayName} vods`,
    ],
    type: "profile",
    image: channel.profileImageURL
      ? { url: channel.profileImageURL, alt: `${channel.displayName} on Twitch` }
      : undefined,
  });
}

function buildMetadataFallbackDescription(login: string): string {
  return `Watch ${login} live on Twitch or browse their recent broadcasts and past broadcasts in the Phantom Twitch player.`;
}

export default async function ChannelPage({ params }: ChannelPageProps) {
  const { channelName } = await params;
  const login = normalizeChannelName(channelName);
  const debugEnabled = isDebugEnabled();

  // Only a real miss is a 404. A Twitch outage renders the player without the
  // server block instead of telling crawlers the page is gone.
  if (!isValidChannelName(login)) notFound();

  const result = await loadChannelPage(login);
  if (result.status === "missing") notFound();

  return (
    <>
      {debugEnabled && <DebugVideoScript />}
      <Suspense fallback={<VodLoading />}>
        <VodApp />
      </Suspense>
      {result.status === "ok" ? (
        <>
          <StructuredData
            data={{
              "@context": "https://schema.org",
              "@type": "ProfilePage",
              name: `${siteConfig.name}: ${result.channel.displayName}`,
              url: new URL(`/${result.channel.login}`, getBaseUrl()).toString(),
              mainEntity: {
                "@type": "Person",
                name: result.channel.displayName,
                alternateName: `@${result.channel.login}`,
                description: result.channel.description || undefined,
                ...(result.channel.profileImageURL
                  ? { image: result.channel.profileImageURL }
                  : {}),
              },
            }}
          />
          <ChannelContent channel={result.channel} />
        </>
      ) : null}
    </>
  );
}
