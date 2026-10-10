"use client";

import { useRouter } from "next/navigation";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { VodLoading } from "./VodLoading";
import { VodView } from "./VodView";
import { ChannelView } from "./ChannelView";
import { useWatchSession } from "./use-watch-session";

export function WatchPage() {
  const router = useRouter();
  const { state, vodData, channelData, error, masterUrl, startTime, playerTime, onVodTimeUpdate } = useWatchSession();

  if (state === "loading") return <VodLoading />;

  return (
    <main className="workspace-canvas twitch-main relative">
      {state === "error" && (
        <div className="media-content relative pt-20">
          <ErrorDisplay message={error} onRetry={() => router.push("/")} />
        </div>
      )}

      {state === "video" && vodData && (
        <VodView key={vodData.vodId}
          vodData={vodData}
          masterUrl={masterUrl}
          startTime={startTime}
          playerTime={playerTime}
          onTimeUpdate={onVodTimeUpdate}
        />
      )}

      {state === "channel" && channelData && (
        <ChannelView key={channelData.login} channel={channelData} />
      )}
    </main>
  );
}
