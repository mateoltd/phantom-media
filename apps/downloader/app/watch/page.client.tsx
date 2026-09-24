"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { DownloadSimple } from "@phosphor-icons/react/ssr";
import { Artwork, Button } from "@phantom/ui";
import { AppHeader } from "@/components/app-header";
import { DownloadOptionsDialog } from "@/components/download-options-dialog";
import { useI18n } from "@/components/locale-provider";
import { PageFallback } from "@/components/page-fallback";
import { SiteFooter } from "@/components/site-footer";
import { useResolve } from "@/hooks/use-youtube";
import { localePath } from "@/lib/i18n";
import { formatDuration } from "@/lib/types";

function WatchPageContent() {
  const { locale, messages: t } = useI18n();
  const searchParams = useSearchParams();
  const videoId = searchParams.get("v");
  const { resolve, loading, error, result } = useResolve();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (videoId) {
      resolve(videoId).then((resolved) => {
        if (resolved && resolved.videos.length === 1) setDialogOpen(true);
      });
    }
  }, [videoId, resolve]);

  const video = result?.videos[0] ?? null;

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader loading={loading} />

      <div className="app-shell flex-1 pb-14 pt-2">
        {loading && (
          <div className="flex min-h-52 flex-col items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-phantom" />
            <p className="mt-4 text-[13px] font-bold text-text-secondary">
              {t.watch.loading}
            </p>
          </div>
        )}

        {error && (
          <div className="max-w-md py-6">
            <p className="border-l-2 border-error py-1 pl-3 text-sm font-bold text-error">
              {error}
            </p>
            <Link
              href={localePath(locale, "/")}
              className="mt-5 inline-flex h-10 items-center rounded-xl border border-border px-4 text-xs font-bold text-text-secondary transition-colors hover:border-text/30 hover:text-text"
            >
              {t.watch.tryAgain}
            </Link>
          </div>
        )}

        {!videoId && !loading && (
          <p className="py-10 text-[13px] text-text-tertiary">
            {t.watch.missing}
          </p>
        )}

        {video && (
          <section className="grid gap-6 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)] sm:items-start">
            <span className="relative block aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface-light">
              <Artwork
                src={video.thumbnailUrl}
                sizes="(min-width: 640px) 320px, 100vw"
                fallback={
                  <span className="flex h-full items-center justify-center text-sm font-bold text-text-tertiary">
                    {video.title.slice(0, 1)}
                  </span>
                }
              />
              {video.duration > 0 && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {formatDuration(video.duration)}
                </span>
              )}
            </span>

            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-text sm:text-[28px]">
                {video.title}
              </h1>
              <p className="mt-2 text-[13px] font-medium text-text-secondary">
                {video.author}
              </p>
              <Button
                onClick={() => setDialogOpen(true)}
                className="mt-6"
              >
                <DownloadSimple weight="regular" size={16} />
                {t.watch.download}
              </Button>
            </div>
          </section>
        )}

      </div>

      <div className="app-shell mt-auto">
        <SiteFooter />
      </div>

      {video && (
        <DownloadOptionsDialog
          video={video}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </main>
  );
}

export default function WatchPageClient() {
  return (
    <Suspense fallback={<PageFallback />}>
      <WatchPageContent />
    </Suspense>
  );
}
