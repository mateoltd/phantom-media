import type { Metadata } from "next";
import { Suspense } from "react";
import { DebugVideoScript } from "@/components/DebugVideoScript";
import { VodApp } from "@/components/VodApp";
import { VodLoading } from "@/components/VodLoading";
import { isDebugEnabled } from "@/lib/debug";
import { buildMetadata, getBaseUrl, siteConfig } from "@/lib/seo";

type VideoPageProps = {
  params: Promise<{ videoId: string }>;
};

// VOD ids are ephemeral: Twitch deletes past broadcasts, so these pages stay
// noindex and self-canonical. Canonicals must never point at a page that
// resolves to the channel route.
export async function generateMetadata({
  params,
}: VideoPageProps): Promise<Metadata> {
  const { videoId } = await params;

  if (!/^\d+$/.test(videoId)) {
    return buildMetadata({
      title: "Watch VOD",
      description: "Watch a Twitch VOD without restrictions in an adaptive quality web player.",
      path: `/videos/${videoId}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: "Watch VOD",
    description: "Watch a Twitch VOD without restrictions in an adaptive quality web player.",
    path: `/videos/${videoId}`,
    keywords: ["watch twitch vod", "twitch vod player"],
    noIndex: true,
  });
}

export default async function VideoPage({ params }: VideoPageProps) {
  const { videoId } = await params;
  const debugEnabled = isDebugEnabled();
  const pageUrl = new URL(`/videos/${videoId}`, getBaseUrl()).toString();

  return (
    <>
      <StructuredDataVod pageUrl={pageUrl} videoId={videoId} />
      {debugEnabled && <DebugVideoScript />}
      <Suspense fallback={<VodLoading />}>
        <VodApp />
      </Suspense>
    </>
  );
}

function StructuredDataVod({
  pageUrl,
  videoId,
}: {
  pageUrl: string;
  videoId: string;
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `Twitch VOD ${videoId}`,
          url: pageUrl,
          isPartOf: { "@type": "WebSite", name: siteConfig.name },
        }).replace(/</g, "\\u003c"),
      }}
    />
  );
}
