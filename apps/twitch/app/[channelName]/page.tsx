import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DebugVideoScript } from "@/components/DebugVideoScript";
import { WatchPage } from "@/components/watch/WatchPage";
import { VodLoading } from "@/components/watch/VodLoading";
import { ChannelView } from "@/components/watch/ChannelView";
import { StructuredData } from "@/components/structured-data";
import {
  buildChannelDescription,
  isValidChannelName,
  loadChannelPage,
  normalizeChannelName,
} from "@/lib/channel-page";
import { DEFAULT_VIEW, viewSlice } from "@/lib/catalog/slices";
import { isDebugEnabled } from "@/lib/debug";
import { seedCatalog } from "@/lib/twitch/catalogs";
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

  if (!isValidChannelName(login)) notFound();

  const result = await loadChannelPage(login);
  if (result.status === "missing") notFound();

  // Only a real miss is a 404. During a Twitch outage the browser asks again
  // itself, instead of crawlers being told the page is gone.
  if (result.status === "error") {
    return (
      <>
        {debugEnabled && <DebugVideoScript />}
        <Suspense fallback={<VodLoading />}>
          <WatchPage />
        </Suspense>
      </>
    );
  }

  const { channel } = result;
  // Started here and streamed into the page, so the header never waits for the videos.
  const videos = seedCatalog(viewSlice({ kind: "channel", anchor: channel.login }, DEFAULT_VIEW));

  return (
    <>
      {debugEnabled && <DebugVideoScript />}
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          name: `${siteConfig.name}: ${channel.displayName}`,
          url: new URL(`/${channel.login}`, getBaseUrl()).toString(),
          mainEntity: {
            "@type": "Person",
            name: channel.displayName,
            alternateName: `@${channel.login}`,
            description: channel.description || undefined,
            ...(channel.profileImageURL ? { image: channel.profileImageURL } : {}),
          },
        }}
      />
      <main className="workspace-canvas twitch-main relative">
        {/* Live state is cached for crawlers' sake; a copy older than a moment is rechecked in the browser. */}
        <ChannelView key={channel.login} channel={channel} revalidate={result.age > 30_000} videos={videos} />
      </main>
    </>
  );
}
