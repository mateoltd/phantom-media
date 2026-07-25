"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconLayersLinked } from "@tabler/icons-react";
import { BatchDownloadDialog } from "@/components/batch-download-dialog";
import { DownloadOptionsDialog } from "@/components/download-options-dialog";
import { useI18n } from "@/components/locale-provider";
import { PageFallback } from "@/components/page-fallback";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { VideoList } from "@/components/video-list";
import { useDownloadQueue } from "@/hooks/use-download-queue";
import { useSettings } from "@/hooks/use-settings";
import { useResolve } from "@/hooks/use-youtube";
import { getBestOption } from "@/lib/download/preference";
import type {
  Container,
  DownloadOption,
  VideoInfo,
  VideoQualityPreference,
} from "@/lib/types";

function PlaylistPageContent() {
  const { messages: t } = useI18n();
  const searchParams = useSearchParams();
  const listId = searchParams.get("list");
  const { resolve, loading, error, result } = useResolve();
  const { enqueueBatch } = useDownloadQueue();
  const { setLastContainer, setLastQualityPreference } = useSettings();

  const [batchOpen, setBatchOpen] = useState(false);
  const [singleVideo, setSingleVideo] = useState<VideoInfo | null>(null);

  useEffect(() => {
    if (listId) {
      resolve(listId).then((resolved) => {
        if (resolved && resolved.videos.length > 1) setBatchOpen(true);
      });
    }
  }, [listId, resolve]);

  const handleBatchDownload = useCallback(
    async (
      videos: VideoInfo[],
      container: Container,
      quality: VideoQualityPreference
    ) => {
      setLastContainer(container);
      setLastQualityPreference(quality);

      const items: { video: VideoInfo; option: DownloadOption }[] = [];
      for (const video of videos) {
        try {
          const response = await fetch("/api/streams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: video.id }),
          });
          if (!response.ok) continue;
          const data = await response.json();
          const bestOption = getBestOption(data.options, container, quality);
          if (bestOption) items.push({ video, option: bestOption });
        } catch {
          // A failed item should not block the rest of the batch.
        }
      }
      return items.length > 0 ? enqueueBatch(items) : [];
    },
    [enqueueBatch, setLastContainer, setLastQualityPreference]
  );

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader loading={loading} />

      <div className="app-shell flex-1 pb-14 pt-2">
        {loading && (
          <div className="flex min-h-40 flex-col items-center justify-center py-10">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-phantom" />
            <p className="mt-4 text-[13px] font-bold text-text-secondary">
              {t.playlist.loading}
            </p>
          </div>
        )}

        {error && (
          <p className="mb-8 border-l-2 border-error py-1 pl-3 text-sm font-bold text-error">
            {error}
          </p>
        )}

        {!listId && !loading && (
          <p className="py-10 text-[13px] text-text-tertiary">
            {t.playlist.missing}
          </p>
        )}

        {result && result.videos.length > 0 && !batchOpen && (
          <section>
                <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
                  <div className="min-w-0">
                    <h1 className="truncate text-2xl font-extrabold tracking-[-0.03em] text-text">
                      {result.title}
                    </h1>
                    <p className="mt-1 text-[11px] font-bold text-text-tertiary">
                      {result.videos.length}{" "}
                      {result.videos.length === 1
                        ? t.home.itemFound
                        : t.home.itemsFound}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBatchOpen(true)}
                    className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-text px-4 text-xs font-bold text-white transition-colors hover:bg-text/85"
                  >
                    <IconLayersLinked size={15} stroke={2} />
                    {t.playlist.downloadAll}
                  </button>
                </div>
            <VideoList videos={result.videos} onVideoClick={setSingleVideo} />
          </section>
        )}
      </div>

      <div className="app-shell mt-auto">
        <SiteFooter />
      </div>

      {singleVideo && (
        <DownloadOptionsDialog
          video={singleVideo}
          open
          onClose={() => setSingleVideo(null)}
        />
      )}

      {result && result.videos.length > 1 && (
        <BatchDownloadDialog
          title={result.title}
          videos={result.videos}
          preselectAll
          open={batchOpen}
          onClose={() => setBatchOpen(false)}
          onDownload={handleBatchDownload}
        />
      )}
    </main>
  );
}

export default function PlaylistPageClient() {
  return (
    <Suspense fallback={<PageFallback />}>
      <PlaylistPageContent />
    </Suspense>
  );
}
