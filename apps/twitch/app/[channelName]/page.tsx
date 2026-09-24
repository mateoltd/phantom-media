import { Suspense } from "react";
import { DebugVideoScript } from "@/components/DebugVideoScript";
import { VodApp } from "@/components/VodApp";
import { isDebugEnabled } from "@/lib/debug";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Watch Twitch Channel",
  description: "Watch a Twitch channel live or browse recent VODs in Phantom Twitch.",
  path: "/",
  noIndex: true,
});

export default function ChannelPage() {
  const debugEnabled = isDebugEnabled();

  return (
    <>
      {debugEnabled && <DebugVideoScript />}
      <Suspense>
        <VodApp />
      </Suspense>
    </>
  );
}
