"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDownload,
  IconX,
} from "@tabler/icons-react";
import { Button, IconButton, Modal } from "@phantom/ui";
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
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="format-dialog-title"
      height={`max-h-[92svh] sm:max-h-[88vh] ${
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
        <IconButton
          label={t.format.close}
          onClick={onClose}
          className="-mr-1 -mt-1"
        >
          <IconX size={18} stroke={2} />
        </IconButton>
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
              <Button
                variant="ghost"
                onClick={() => backToFormats(job.id)}
                className="mr-auto gap-1.5 pl-2 pr-3"
              >
                <IconArrowLeft size={16} stroke={2.2} />
                {t.format.back}
              </Button>
            )}
            {(job.status === "started" || job.status === "enqueued") && (
              <Button variant="ghost" onClick={() => cancelDownload(job.id)}>
                {t.format.stop}
              </Button>
            )}
            {(job.status === "failed" || job.status === "canceled") && (
              <Button variant="outline" onClick={() => restartDownload(job.id)}>
                {t.format.tryAgain}
              </Button>
            )}
            <Button onClick={onClose}>{t.format.done}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t.format.cancel}
            </Button>
            <Button
              onClick={startDownload}
              disabled={!selectedOption || loading || DOWNLOADS_RESTRICTED}
            >
              <IconDownload size={16} stroke={2.1} />
              {t.format.prepare}
            </Button>
          </>
        )}
      </div>
    </Modal>
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
