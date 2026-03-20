"use client";

import { useState, useMemo } from "react";
import type { VideoInfo, Container, VideoQualityPreference } from "@/lib/types";
import { VideoList } from "./video-list";
import { QUALITY_PRESETS, CONTAINER_OPTIONS } from "@/lib/constants";
import { useSettings } from "@/hooks/use-settings";
import { IconX, IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";

// Temporary restriction flag - YouTube is blocking server-side downloads
const DOWNLOADS_RESTRICTED = true;

interface BatchDownloadDialogProps {
  title: string;
  videos: VideoInfo[];
  preselectAll: boolean;
  open: boolean;
  onClose: () => void;
  onDownload: (
    videos: VideoInfo[],
    container: Container,
    quality: VideoQualityPreference
  ) => void;
}

export function BatchDownloadDialog({
  title,
  videos,
  preselectAll,
  open,
  onClose,
  onDownload,
}: BatchDownloadDialogProps) {
  const { lastContainer, lastQualityPreference } = useSettings();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(preselectAll ? videos.map((v) => v.id) : [])
  );
  const [container, setContainer] = useState<Container>(lastContainer);
  const [quality, setQuality] =
    useState<VideoQualityPreference>(lastQualityPreference);

  const selectedVideos = useMemo(
    () => videos.filter((v) => selectedIds.has(v.id)),
    [videos, selectedIds]
  );

  if (!open) return null;

  const toggleSelect = (video: VideoInfo) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(video.id)) next.delete(video.id);
      else next.add(video.id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map((v) => v.id)));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel-soft flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.04] p-4">
          <div>
            <h3 className="text-[14px] font-semibold tracking-tight text-text">
              {title}
            </h3>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              {videos.length} videos
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-white/[0.05] hover:text-text-secondary"
          >
            <IconX size={16} stroke={2} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {DOWNLOADS_RESTRICTED ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                <IconAlertTriangle size={24} stroke={1.8} />
              </div>
              <div className="space-y-2">
                <h4 className="text-[15px] font-semibold text-text">
                  Downloads Temporarily Unavailable
                </h4>
                <p className="text-[13px] leading-relaxed text-text-secondary">
                  YouTube has recently implemented new restrictions that are affecting
                  download services. We are actively working on a solution.
                </p>
              </div>
              <div className="mt-2 rounded-lg bg-white/[0.03] px-4 py-3">
                <p className="text-[12px] text-text-tertiary">
                  In the meantime, you can use{" "}
                  <a
                    href="https://github.com/yt-dlp/yt-dlp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-phantom hover:underline"
                  >
                    yt-dlp
                    <IconExternalLink size={12} />
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Settings */}
              <div className="flex gap-4 border-b border-white/[0.04] px-4 py-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-text-tertiary">
                    Format
                  </label>
                  <select
                    value={container}
                    onChange={(e) => setContainer(e.target.value as Container)}
                    className="w-full rounded-lg border border-white/[0.05] bg-white/[0.03] px-2.5 py-2 text-[13px] text-text outline-none transition-colors focus:bg-white/[0.06]"
                  >
                    {CONTAINER_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-text-tertiary">
                    Quality
                  </label>
                  <select
                    value={quality}
                    onChange={(e) =>
                      setQuality(e.target.value as VideoQualityPreference)
                    }
                    className="w-full rounded-lg border border-white/[0.05] bg-white/[0.03] px-2.5 py-2 text-[13px] text-text outline-none transition-colors focus:bg-white/[0.06]"
                  >
                    {QUALITY_PRESETS.map((q) => (
                      <option key={q.value} value={q.value}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Video list */}
              <div className="mb-2 px-1">
                <button
                  onClick={toggleAll}
                  className="text-[11px] font-medium text-phantom transition-colors hover:text-phantom-light"
                >
                  {selectedIds.size === videos.length
                    ? "Deselect all"
                    : "Select all"}
                </button>
              </div>
              <VideoList
                videos={videos}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.04] p-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] text-text-tertiary transition-colors hover:bg-white/[0.03] hover:text-text-secondary"
          >
            {DOWNLOADS_RESTRICTED ? "Close" : "Cancel"}
          </button>
          {!DOWNLOADS_RESTRICTED && (
            <button
              onClick={() => {
                onDownload(selectedVideos, container, quality);
                onClose();
              }}
              disabled={selectedVideos.length === 0}
              className="rounded-lg bg-phantom px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-[0.97] disabled:opacity-30"
            >
              Download{" "}
              {selectedVideos.length > 0 ? `(${selectedVideos.length})` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
