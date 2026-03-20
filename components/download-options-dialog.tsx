"use client";

import { useState, useEffect } from "react";
import type { VideoInfo, DownloadOption } from "@/lib/types";
import { formatFileSize, containerDisplayName } from "@/lib/types";
import { useStreams } from "@/hooks/use-youtube";
import { IconX, IconAlertTriangle, IconExternalLink } from "@tabler/icons-react";
import { DOWNLOADS_RESTRICTED } from "@/lib/config";

interface DownloadOptionsDialogProps {
  video: VideoInfo;
  open: boolean;
  onClose: () => void;
  onDownload: (video: VideoInfo, option: DownloadOption) => void;
}

export function DownloadOptionsDialog({
  video,
  open,
  onClose,
  onDownload,
}: DownloadOptionsDialogProps) {
  const { fetchStreams, loading, error, options } = useStreams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open && !DOWNLOADS_RESTRICTED) {
      fetchStreams(video.id);
      setSelectedId(null);
    }
  }, [open, video.id, fetchStreams]);

  // Auto-select first option
  useEffect(() => {
    if (options.length > 0 && !selectedId) {
      setSelectedId(options[0].id);
    }
  }, [options, selectedId]);

  if (!open) return null;

  const selectedOption = options.find((o) => o.id === selectedId);

  // Group options by type
  const videoOptions = options.filter((o) => !o.isAudioOnly);
  const audioOptions = options.filter((o) => o.isAudioOnly);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="panel-soft max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-white/[0.04] p-4">
          <div className="h-16 w-28 shrink-0 overflow-hidden rounded-md bg-surface">
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[13px] font-semibold tracking-tight text-text">
              {video.title}
            </h3>
            <p className="mt-1 text-[11px] text-text-tertiary">
              {video.author}
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
        <div className="max-h-[50vh] overflow-y-auto p-4">
          {DOWNLOADS_RESTRICTED ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
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
              {loading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <div className="overflow-hidden rounded-full bg-white/[0.05]">
                    <div
                      className="h-[3px] w-1/5 rounded-full bg-phantom/50"
                      style={{ animation: "progress-slide 1.5s ease-in-out infinite" }}
                    />
                  </div>
                  <p className="text-[12px] text-text-tertiary">
                    Loading download options...
                  </p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/10 text-error">
                    <IconAlertTriangle size={20} stroke={1.8} />
                  </div>
                  <p className="text-[13px] text-error">{error}</p>
                </div>
              )}

              {!loading && !error && options.length > 0 && (
                <div className="flex flex-col gap-4">
                  {/* Video options */}
                  {videoOptions.length > 0 && (
                    <div>
                      <div className="mb-2 px-1">
                        <span className="text-[11px] font-medium text-text-tertiary">
                          Video
                        </span>
                      </div>
                      <div className="space-y-px">
                        {videoOptions.map((opt) => (
                          <OptionRow
                            key={opt.id}
                            option={opt}
                            selected={selectedId === opt.id}
                            onSelect={() => setSelectedId(opt.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audio options */}
                  {audioOptions.length > 0 && (
                    <div>
                      <div className="mb-2 px-1">
                        <span className="text-[11px] font-medium text-text-tertiary">
                          Audio Only
                        </span>
                      </div>
                      <div className="space-y-px">
                        {audioOptions.map((opt) => (
                          <OptionRow
                            key={opt.id}
                            option={opt}
                            selected={selectedId === opt.id}
                            onSelect={() => setSelectedId(opt.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                if (!selectedOption) return;
                onDownload(video, selectedOption);
              }}
              disabled={!selectedOption || loading}
              className="rounded-lg bg-phantom px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-phantom-dark active:scale-[0.97] disabled:opacity-30"
            >
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: DownloadOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        selected
          ? "bg-phantom/15"
          : "hover:bg-white/[0.03]"
      }`}
    >
      {/* Radio indicator */}
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? "border-phantom" : "border-white/[0.08]"
        }`}
      >
        {selected && (
          <div className="h-2 w-2 rounded-full bg-phantom" />
        )}
      </div>

      <div className="flex flex-1 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-secondary">
            {option.isAudioOnly
              ? containerDisplayName(option.container)
              : option.qualityLabel ?? "Unknown"}
          </span>
          <span className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[10px] font-medium text-text-tertiary">
            {containerDisplayName(option.container)}
          </span>
          {option.needsMuxing && (
            <span className="rounded bg-phantom/10 px-1 py-0.5 text-[10px] font-medium text-phantom-light">
              Mux
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-text-tertiary">
          {formatFileSize(option.totalSize)}
        </span>
      </div>
    </button>
  );
}
