"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDownload,
  IconX,
} from "@tabler/icons-react";
import type { DownloadOption, VideoInfo } from "@/lib/types";
import {
  containerDisplayName,
  formatDuration,
  formatFileSize,
} from "@/lib/types";
import { useStreams } from "@/hooks/use-youtube";
import { useDownloadQueue } from "@/hooks/use-download-queue";
import { DOWNLOADS_RESTRICTED } from "@/lib/config";
import { useI18n } from "@/components/locale-provider";
import { DownloadProgress } from "@/components/download-progress";
import type { Messages } from "@/lib/i18n";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

interface DownloadOptionsDialogProps {
  video: VideoInfo;
  open: boolean;
  onClose: () => void;
}

type MediaKind = "video" | "audio";

export function DownloadOptionsDialog({
  video,
  open,
  onClose,
}: DownloadOptionsDialogProps) {
  const { messages: t } = useI18n();
  const { fetchStreams, loading, error, options } = useStreams();
  const { downloads, enqueue, cancelDownload, restartDownload, removeDownload } =
    useDownloadQueue();
  const [mediaKind, setMediaKind] = useState<MediaKind>("video");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  useModalBehavior(open, onClose);

  useEffect(() => {
    if (open && !DOWNLOADS_RESTRICTED) {
      fetchStreams(video.id);
    }
  }, [open, video.id, fetchStreams]);

  if (!open) return null;

  const job = jobId
    ? downloads.find((download) => download.id === jobId) ?? null
    : null;

  const videoOptions = options.filter((option) => !option.isAudioOnly);
  const audioOptions = options.filter((option) => option.isAudioOnly);
  const activeKind =
    mediaKind === "video" && videoOptions.length === 0 && audioOptions.length > 0
      ? "audio"
      : mediaKind;
  const visibleOptions = activeKind === "video" ? videoOptions : audioOptions;
  const effectiveSelectedId = visibleOptions.some(
    (option) => option.id === selectedId
  )
    ? selectedId
    : visibleOptions[0]?.id ?? null;
  const selectedOption = visibleOptions.find(
    (option) => option.id === effectiveSelectedId
  );

  const changeKind = (kind: MediaKind) => {
    setMediaKind(kind);
    setSelectedId(null);
  };

  const startDownload = () => {
    if (!selectedOption) return;
    setJobId(enqueue(video, selectedOption));
  };

  const backToFormats = (finishedJobId: string) => {
    setJobId(null);
    removeDownload(finishedJobId);
  };

  const specs = job
    ? [
        containerDisplayName(job.option.container),
        job.option.qualityLabel ?? (job.option.isAudioOnly ? t.format.audio : ""),
        job.option.totalSize > 0 ? formatFileSize(job.option.totalSize) : "",
      ].filter(Boolean)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="format-dialog-title"
        className={`panel-soft flex max-h-[92svh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[24px] animate-slide-up sm:max-h-[88vh] sm:rounded-[24px] ${
          // The chooser is held at one height so it cannot grow with the number
          // of formats; a running download is a fixed, much shorter panel.
          job ? "" : "h-[72svh] sm:h-[560px]"
        }`}
      >
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <div className="relative hidden h-[58px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-[#ded9cf] sm:block">
            <Image
              src={video.thumbnailUrl}
              alt=""
              fill
              sizes="104px"
              unoptimized
              className="h-full w-full object-cover"
            />
            {video.duration > 0 && (
              <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] text-white">
                {formatDuration(video.duration)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="format-dialog-title"
              className="line-clamp-2 text-[15px] font-extrabold leading-5 text-text"
            >
              {video.title}
            </h2>
            <p className="mt-1.5 truncate font-mono text-[10px] text-text-tertiary">
              {job ? specs.join(", ") : video.author}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition-colors hover:bg-bg hover:text-text"
            aria-label={t.format.close}
          >
            <IconX size={18} stroke={2} />
          </button>
        </div>

        {job ? (
          <div className="flex min-h-0 flex-1 items-center px-4 sm:px-5">
            <div className="w-full">
              <DownloadProgress item={job} />
            </div>
          </div>
        ) : DOWNLOADS_RESTRICTED ? (
          <MessageState
            title={t.format.unavailableTitle}
            body={t.format.unavailableBody}
          />
        ) : loading ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-phantom" />
            <p className="mt-4 text-xs font-bold text-text-secondary">
              {t.format.loading}
            </p>
          </div>
        ) : error ? (
          <MessageState title={t.format.error} body={error} />
        ) : (
          <>
            <div
              className="flex gap-6 border-b border-border/70 px-4 sm:px-5"
              role="tablist"
              aria-label={t.format.mediaType}
            >
              <KindTab
                active={activeKind === "video"}
                disabled={videoOptions.length === 0}
                onClick={() => changeKind("video")}
              >
                {t.format.video}
              </KindTab>
              <KindTab
                active={activeKind === "audio"}
                disabled={audioOptions.length === 0}
                onClick={() => changeKind("audio")}
              >
                {t.format.audio}
              </KindTab>
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5"
              role="radiogroup"
              aria-label={
                activeKind === "video" ? t.format.quality : t.format.format
              }
            >
              {visibleOptions.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-text-tertiary">
                  {t.format.noFormats}
                </p>
              ) : (
                visibleOptions.map((option) => (
                  <FormatRow
                    key={option.id}
                    option={option}
                    selected={option.id === effectiveSelectedId}
                    onSelect={() => setSelectedId(option.id)}
                    copy={t.format}
                  />
                ))
              )}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-1 border-t border-border/70 p-3 sm:px-5 sm:py-4">
          {job ? (
            <>
              {job.status !== "started" && job.status !== "enqueued" && (
                <button
                  type="button"
                  onClick={() => backToFormats(job.id)}
                  className="mr-auto flex h-11 items-center gap-1.5 rounded-xl pl-2 pr-3 text-[13px] font-bold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
                >
                  <IconArrowLeft size={16} stroke={2.2} />
                  {t.format.back}
                </button>
              )}
              {(job.status === "started" || job.status === "enqueued") && (
                <button
                  type="button"
                  onClick={() => cancelDownload(job.id)}
                  className="h-11 rounded-xl px-4 text-[13px] font-bold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
                >
                  {t.format.stop}
                </button>
              )}
              {(job.status === "failed" || job.status === "canceled") && (
                <button
                  type="button"
                  onClick={() => restartDownload(job.id)}
                  className="h-11 rounded-xl border border-border px-4 text-[13px] font-bold text-text-secondary transition-colors hover:border-text/30 hover:text-text"
                >
                  {t.format.tryAgain}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl bg-phantom px-5 text-[13px] font-bold text-white transition-colors hover:bg-phantom-dark"
              >
                {t.format.done}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl px-4 text-[13px] font-bold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
              >
                {t.format.cancel}
              </button>
              <button
                type="button"
                onClick={startDownload}
                disabled={!selectedOption || loading || DOWNLOADS_RESTRICTED}
                className="flex h-11 items-center gap-2 rounded-xl bg-phantom px-5 text-[13px] font-bold text-white transition-colors hover:bg-phantom-dark disabled:cursor-not-allowed disabled:bg-transparent disabled:text-text-tertiary disabled:shadow-[inset_0_0_0_1px_var(--color-border)]"
              >
                <IconDownload size={16} stroke={2.1} />
                {t.format.prepare}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function KindTab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative -mb-px pb-3 pt-1 text-[13px] font-extrabold transition-colors disabled:cursor-not-allowed disabled:text-text-tertiary/50 ${
        active ? "text-text" : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-phantom" />
      )}
    </button>
  );
}

function FormatRow({
  option,
  selected,
  onSelect,
  copy,
}: {
  option: DownloadOption;
  selected: boolean;
  onSelect: () => void;
  copy: Messages["format"];
}) {
  const label = option.isAudioOnly
    ? containerDisplayName(option.container)
    : option.qualityLabel ?? copy.original;
  const detail = [
    option.isAudioOnly ? null : containerDisplayName(option.container),
    option.totalSize > 0 ? formatFileSize(option.totalSize) : null,
    getPreparationLabel(option, copy),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-black/[0.07] py-3 text-left transition-colors last:border-b-0 hover:bg-bg/60"
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected ? "border-phantom" : "border-border"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-phantom" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-text">
        {label}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
        {detail}
      </span>
    </button>
  );
}

function getPreparationLabel(
  option: DownloadOption,
  copy: Messages["format"]
): string {
  if (!option.needsMuxing) return copy.source;
  return option.isAudioOnly ? copy.converted : copy.merged;
}

function MessageState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-error/10 text-error">
        <IconAlertTriangle size={20} stroke={2} />
      </span>
      <h3 className="mt-4 text-sm font-extrabold text-text">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-text-secondary">
        {body}
      </p>
    </div>
  );
}
