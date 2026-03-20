"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDownload,
  IconExternalLink,
  IconSettings,
} from "@tabler/icons-react";
import { DOWNLOADS_RESTRICTED } from "@/lib/config";
import { BatchDownloadDialog } from "@/components/batch-download-dialog";
import { DownloadOptionsDialog } from "@/components/download-options-dialog";
import { DownloadQueue } from "@/components/download-queue";
import { LogoMark } from "@/components/Logo";
import { SearchBar } from "@/components/search-bar";
import { SettingsPanel } from "@/components/settings-panel";
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

function Navbar({
  onSettingsClick,
  showBack = false,
}: {
  onSettingsClick: () => void;
  showBack?: boolean;
}) {
  return (
    <nav className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
      {showBack ? (
        <button
          type="button"
          onClick={() => window.location.assign("/")}
          className="flex items-center gap-1.5 text-[13px] font-medium text-text-tertiary transition-colors hover:text-text-secondary active:scale-95"
        >
          <IconArrowLeft size={14} stroke={2} />
          Back
        </button>
      ) : (
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={18} className="text-text-secondary" />
          <span className="text-[13px] font-semibold tracking-tight text-text-secondary">
            Phantom
          </span>
        </Link>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={onSettingsClick}
          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-white/5 hover:text-text-secondary active:scale-95"
          title="Settings"
        >
          <IconSettings size={16} stroke={2} />
        </button>
        <span className="rounded-full bg-white/4 px-2.5 py-1 text-[10px] font-medium tracking-wider text-text-tertiary/80">
          v1.0
        </span>
      </div>
    </nav>
  );
}

function HomeSeoContent() {
  const questions = [
    {
      question: "What can Phantom YouTube resolve?",
      answer:
        "The app can resolve individual videos, playlists, and search-based YouTube queries so you can review available downloads before saving them.",
    },
    {
      question: "Which formats are supported?",
      answer:
        "Available formats depend on the source video, but the app is designed around common video and audio download workflows such as MP4 and audio-oriented options.",
    },
    {
      question: "Is Phantom YouTube affiliated with YouTube?",
      answer:
        "No. Phantom YouTube is an independent tool and is not endorsed by or affiliated with YouTube or Google.",
    },
  ];

  return (
    <section className="mx-auto mt-20 max-w-3xl px-5 pb-16 sm:px-6 lg:px-8">
      <div className="space-y-8 border-t border-white/8 pt-8">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-tertiary">
            Overview
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-text sm:text-3xl">
            A simpler YouTube downloader workflow
          </h2>
          <p className="mt-4 text-sm leading-7 text-text-secondary sm:text-[15px]">
            Phantom YouTube is built to resolve individual videos, playlists,
            and search queries so you can review available download options
            quickly without a cluttered interface. The goal is a direct workflow
            for personal use and other situations where you already have the
            right to access, copy, or save the material.
          </p>
          <p className="mt-4 text-sm leading-7 text-text-secondary sm:text-[15px]">
            Available formats depend on the source media and the streams exposed
            at the time of the request. Queueing and stream selection are there
            to keep the process straightforward, not to change the rights status
            of any content.
          </p>
        </section>

        <section className="border-t border-white/8 pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-tertiary">
            Responsible use
          </p>
          <p className="mt-4 text-sm leading-7 text-text-secondary sm:text-[15px]">
            Only download content you own or are authorized to save. You are
            responsible for complying with copyright law, platform terms,
            licenses, contractual restrictions, and local regulations. Phantom
            YouTube is independent and is not affiliated with or endorsed by
            YouTube or Google.
          </p>
          <Link
            href="/disclaimer"
            className="mt-5 inline-flex text-sm font-semibold text-text-secondary transition-colors hover:text-text"
          >
            Read the legal disclaimer
          </Link>
        </section>

        <section className="border-t border-white/8 pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-tertiary">
            FAQ
          </p>
          <div className="mt-4 space-y-5">
            {questions.map((item) => (
              <article key={item.question}>
                <h3 className="text-sm font-semibold text-text sm:text-[15px]">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm leading-7 text-text-secondary sm:text-[15px]">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export default function HomePageClient() {
  const { resolve, loading, error, result } = useResolve();
  const { enqueue, enqueueBatch, downloads } = useDownloadQueue();
  const { setLastContainer, setLastQualityPreference } = useSettings();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [singleDialogVideo, setSingleDialogVideo] = useState<VideoInfo | null>(
    null
  );
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  const handleSubmit = useCallback(
    async (query: string) => {
      const res = await resolve(query);
      if (!res) return;

      if (res.videos.length === 1 && res.kind === "video") {
        setSingleDialogVideo(res.videos[0]);
      } else if (
        res.videos.length > 1 &&
        res.kind !== "search" &&
        res.kind !== "aggregate"
      ) {
        setBatchDialogOpen(true);
      }
    },
    [resolve]
  );

  const handleVideoClick = useCallback((video: VideoInfo) => {
    setSingleDialogVideo(video);
  }, []);

  const handleSingleDownload = useCallback(
    (video: VideoInfo, option: DownloadOption) => {
      enqueue(video, option);
      setSingleDialogVideo(null);
    },
    [enqueue]
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
          const res = await fetch("/api/streams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: video.id }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          const bestOption = getBestOption(data.options, container, quality);
          if (bestOption) {
            items.push({ video, option: bestOption });
          }
        } catch {
          // Skip videos that fail
        }
      }

      if (items.length > 0) {
        enqueueBatch(items);
      }
    },
    [enqueueBatch, setLastContainer, setLastQualityPreference]
  );

  const hasContent = result || downloads.length > 0;
  const isHero = !hasContent && !loading;

  return (
    <main className="relative min-h-screen">
      {isHero && (
        <div className="flex min-h-screen flex-col animate-fade-in">
          <Navbar onSettingsClick={() => setSettingsOpen(true)} />

          <div className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 lg:px-8">
            {DOWNLOADS_RESTRICTED && (
              <div className="mx-auto mb-6 max-w-xl">
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <IconAlertTriangle
                    size={18}
                    stroke={1.8}
                    className="mt-0.5 shrink-0 text-amber-500"
                  />
                  <div className="space-y-1">
                    <p className="text-[13px] font-medium text-text">
                      Downloads Temporarily Unavailable
                    </p>
                    <p className="text-[12px] leading-relaxed text-text-secondary">
                      YouTube has implemented new restrictions affecting download services.
                      We are working on a solution. In the meantime, you can use{" "}
                      <a
                        href="https://github.com/yt-dlp/yt-dlp"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-phantom hover:underline"
                      >
                        yt-dlp
                        <IconExternalLink size={11} />
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
            <SearchBar
              onSubmit={handleSubmit}
              loading={loading}
              compact={false}
            />
          </div>

          <SiteFooter className="px-5 pb-4 text-center sm:px-8" />
        </div>
      )}

      {!isHero && (
        <div className="min-h-screen animate-fade-in">
          <Navbar onSettingsClick={() => setSettingsOpen(true)} showBack />

          <div className="mx-auto max-w-5xl px-2 sm:px-6 lg:px-8">
            <div className="mb-5 px-1 animate-slide-up sm:px-0">
              <SearchBar
                onSubmit={handleSubmit}
                loading={loading}
                compact={true}
              />
            </div>

            {loading && !result && (
              <div className="mx-auto mt-10 w-full max-w-sm animate-fade-in">
                <div className="overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-[3px] w-1/5 rounded-full bg-phantom/50"
                    style={{ animation: "progress-slide 1.5s ease-in-out infinite" }}
                  />
                </div>
                <p className="mt-3 text-center text-[12px] text-text-tertiary">
                  Resolving...
                </p>
              </div>
            )}

            {error && (
              <div className="mx-auto mt-10 max-w-md animate-slide-up text-center">
                <p className="text-[15px] font-semibold tracking-tight text-text">
                  {error}
                </p>
              </div>
            )}

            {downloads.length > 0 && (
              <div className="mb-5 animate-fade-in px-1 sm:px-0">
                <DownloadQueue />
              </div>
            )}

            {result && result.videos.length >= 1 && !batchDialogOpen && (
              <div
                className="stagger-child px-1 sm:px-0"
                style={{ animationDelay: "0.05s" }}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium text-text-tertiary">
                    {result.title}
                  </span>
                  <button
                    onClick={() => setBatchDialogOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-phantom px-3 py-1.5 text-[11px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-[0.97]"
                  >
                    <IconDownload size={12} stroke={2} />
                    Download All
                  </button>
                </div>
                <VideoList
                  videos={result.videos}
                  onVideoClick={handleVideoClick}
                />
              </div>
            )}

            <SiteFooter className="mt-8 pb-4 text-center" />
          </div>
        </div>
      )}

      {isHero && <HomeSeoContent />}

      {singleDialogVideo && (
        <DownloadOptionsDialog
          video={singleDialogVideo}
          open={!!singleDialogVideo}
          onClose={() => setSingleDialogVideo(null)}
          onDownload={handleSingleDownload}
        />
      )}

      {result && result.videos.length > 1 && (
        <BatchDownloadDialog
          title={result.title}
          videos={result.videos}
          preselectAll={result.kind !== "search" && result.kind !== "aggregate"}
          open={batchDialogOpen}
          onClose={() => setBatchDialogOpen(false)}
          onDownload={handleBatchDownload}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}
