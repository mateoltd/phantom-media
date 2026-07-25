"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconAlertTriangle, IconLayersLinked } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { BatchDownloadDialog } from "@/components/batch-download-dialog";
import { DownloadOptionsDialog } from "@/components/download-options-dialog";
import { useI18n } from "@/components/locale-provider";
import { PageFallback } from "@/components/page-fallback";
import { SiteFooter } from "@/components/site-footer";
import { VideoList } from "@/components/video-list";
import { useDownloadQueue } from "@/hooks/use-download-queue";
import { useSettings } from "@/hooks/use-settings";
import { useResolve } from "@/hooks/use-youtube";
import { DOWNLOADS_RESTRICTED } from "@/lib/config";
import { getBestOption } from "@/lib/download/preference";
import { localePath, localizeResultTitle } from "@/lib/i18n";
import type {
  Container,
  DownloadOption,
  VideoInfo,
  VideoQualityPreference,
} from "@/lib/types";

function SearchPageContent() {
  const { locale, messages: t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const { resolve, loading, error, result } = useResolve();
  const { enqueueBatch } = useDownloadQueue();
  const { setLastContainer, setLastQualityPreference } = useSettings();
  const [singleVideo, setSingleVideo] = useState<VideoInfo | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  useEffect(() => {
    if (!query) return;
    resolve(query).then((resolved) => {
      const single =
        resolved && resolved.videos.length === 1 && resolved.kind === "video";
      const collection =
        resolved &&
        resolved.videos.length > 1 &&
        resolved.kind !== "search" &&
        resolved.kind !== "aggregate";
      setSingleVideo(single ? resolved.videos[0] : null);
      setBatchOpen(Boolean(collection));
    });
  }, [query, resolve]);

  const handleSearch = useCallback(
    (next: string) => {
      router.push(localePath(locale, `/search?q=${encodeURIComponent(next)}`));
    },
    [locale, router]
  );

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
          const option = getBestOption(data.options, container, quality);
          if (option) items.push({ video, option });
        } catch {
          // A failed item should not block the rest of the batch.
        }
      }

      return items.length > 0 ? enqueueBatch(items) : [];
    },
    [enqueueBatch, setLastContainer, setLastQualityPreference]
  );

  const showResults = result && result.videos.length > 0 && !batchOpen;

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader
        onSearch={handleSearch}
        onSelectVideo={setSingleVideo}
        loading={loading}
      />

      <div className="app-shell flex-1 pb-14 pt-2">
        {DOWNLOADS_RESTRICTED && <RestrictedNotice />}

        {error && (
          <p className="mb-8 border-l-2 border-error py-1 pl-3 text-sm font-bold text-error">
            {error}
          </p>
        )}

        {loading && !result && (
          <div className="flex min-h-52 flex-col items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-phantom" />
            <p className="mt-4 text-[13px] font-bold text-text-secondary">
              {t.home.resolvingTitle}
            </p>
          </div>
        )}

        {showResults && (
          <>
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.08] pb-5">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold tracking-[-0.03em] text-text">
                  {localizeResultTitle(result.title || query || "", t)}
                </h1>
                <p className="mt-1 text-[11px] font-bold text-text-tertiary">
                  {result.videos.length}{" "}
                  {result.videos.length === 1
                    ? t.home.itemFound
                    : t.home.itemsFound}
                </p>
              </div>
              {result.videos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setBatchOpen(true)}
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-text px-4 text-xs font-bold text-white transition-colors hover:bg-text/85"
                >
                  <IconLayersLinked size={15} stroke={2} />
                  {t.home.batch}
                </button>
              )}
            </div>
            <VideoList videos={result.videos} onVideoClick={setSingleVideo} />
          </>
        )}

        {!query && !loading && (
          <p className="py-10 text-[13px] text-text-tertiary">
            {t.search.defaultPlaceholder}
          </p>
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
          title={localizeResultTitle(result.title, t)}
          videos={result.videos}
          preselectAll={result.kind !== "search" && result.kind !== "aggregate"}
          open={batchOpen}
          onClose={() => setBatchOpen(false)}
          onDownload={handleBatchDownload}
        />
      )}
    </main>
  );
}

function RestrictedNotice() {
  const { messages: t } = useI18n();

  return (
    <div className="mb-8 flex items-start gap-3 border-l-2 border-phantom py-1 pl-3">
      <IconAlertTriangle
        size={17}
        stroke={2}
        className="mt-0.5 shrink-0 text-phantom-deep"
      />
      <div>
        <p className="text-[13px] font-bold text-text">
          {t.home.restrictedTitle}
        </p>
        <p className="mt-1 text-[12px] leading-5 text-text-secondary">
          {t.home.restrictedBody}
        </p>
      </div>
    </div>
  );
}

export default function SearchPageClient() {
  return (
    <Suspense fallback={<PageFallback />}>
      <SearchPageContent />
    </Suspense>
  );
}
