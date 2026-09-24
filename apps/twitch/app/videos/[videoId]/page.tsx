import { Suspense } from "react";
import { DebugVideoScript } from "@/components/DebugVideoScript";
import { VodApp } from "@/components/VodApp";
import { isDebugEnabled } from "@/lib/debug";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Watch VOD",
  description: "Watch a Twitch VOD without restrictions in an adaptive quality web player.",
  path: "/videos",
  noIndex: true,
});

export default function VideoPage() {
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
