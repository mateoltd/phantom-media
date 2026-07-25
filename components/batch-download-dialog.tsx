"use client";

import { useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconX,
} from "@tabler/icons-react";
import type {
  Container,
  VideoInfo,
  VideoQualityPreference,
} from "@/lib/types";
import { CONTAINER_OPTIONS, QUALITY_PRESETS } from "@/lib/constants";
import { useDownloadQueue } from "@/hooks/use-download-queue";
import { useSettings } from "@/hooks/use-settings";
import { useI18n } from "@/components/locale-provider";
import { DownloadItemRow } from "@/components/download-item";
import { StyledSelect } from "@/components/ui/styled-select";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { VideoList } from "./video-list";

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
  ) => Promise<string[]>;
}

export function BatchDownloadDialog({
  title,
  videos,
  preselectAll,
  open,
  onClose,
  onDownload,
}: BatchDownloadDialogProps) {
  const { messages: t } = useI18n();
  const { lastContainer, lastQualityPreference } = useSettings();
  const { downloads, cancelDownload, restartDownload, removeDownload } =
    useDownloadQueue();
  const [selectedIds, setSelectedIds] = useState(
    new Set(preselectAll ? videos.map((video) => video.id) : [])
  );
  const [container, setContainer] = useState<Container>(lastContainer);
  const [quality, setQuality] =
    useState<VideoQualityPreference>(lastQualityPreference);
  const [preparing, setPreparing] = useState(false);
  const [jobIds, setJobIds] = useState<string[] | null>(null);
  useModalBehavior(open, onClose);

  const selectedVideos = useMemo(
    () => videos.filter((video) => selectedIds.has(video.id)),
    [videos, selectedIds]
  );

  if (!open) return null;

  const jobs = jobIds
    ? downloads.filter((download) => jobIds.includes(download.id))
    : [];
  const savedCount = jobs.filter((job) => job.status === "completed").length;
  const overallPercent = jobs.length
    ? Math.round(
        (jobs.reduce(
          (total, job) => total + (job.status === "completed" ? 1 : job.progress),
          0
        ) /
          jobs.length) *
          100
      )
    : 0;

  const toggleSelect = (video: VideoInfo) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(video.id)) next.delete(video.id);
      else next.add(video.id);
      return next;
    });
  };

  const settled =
    jobIds !== null &&
    !preparing &&
    !jobs.some(
      (job) => job.status === "enqueued" || job.status === "started"
    );

  const backToSelection = () => {
    jobs.forEach((job) => removeDownload(job.id));
    setJobIds(null);
  };

  const start = async () => {
    setPreparing(true);
    try {
      setJobIds(await onDownload(selectedVideos, container, quality));
    } finally {
      setPreparing(false);
    }
  };

  const allSelected = selectedIds.size === videos.length;
  const containerOptions = CONTAINER_OPTIONS.map((option) => ({
    ...option,
    label: option.label.replace("Audio", t.batch.audio),
  }));
  const qualityOptions = QUALITY_PRESETS.map((option) => ({
    ...option,
    label:
      option.value === "highest"
        ? t.batch.highest
        : option.value === "lowest"
          ? t.batch.lowest
          : `${t.batch.upTo} ${option.maxHeight}p`,
  }));
  const started = jobIds !== null || preparing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-dialog-title"
        className="panel-soft flex h-[84svh] max-h-[94svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] animate-slide-up sm:h-[660px] sm:max-h-[90vh] sm:rounded-[24px]"
      >
        <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <h2
              id="batch-dialog-title"
              className="truncate text-lg font-extrabold tracking-[-0.02em] text-text"
            >
              {title}
            </h2>
            <p className="mt-1 font-mono text-[10px] text-text-tertiary">
              {started
                ? `${savedCount} / ${jobs.length || selectedVideos.length} ${t.queue.saved.toLowerCase()}`
                : `${selectedVideos.length} / ${videos.length} ${t.batch.selected}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition-colors hover:bg-bg hover:text-text"
            aria-label={t.batch.close}
          >
            <IconX size={17} stroke={2} />
          </button>
        </div>

        {started ? (
          <>
            <div className="px-4 pb-4 sm:px-5">
              <span
                className="job-rail"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={overallPercent}
                aria-label={t.batch.running}
              >
                <span
                  className={`job-fill ${
                    savedCount === jobs.length && jobs.length > 0
                      ? "job-fill-done"
                      : ""
                  }`}
                  style={{ width: `${overallPercent}%` }}
                />
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/70 px-4 sm:px-5">
              {preparing && (
                <div className="flex min-h-52 flex-col items-center justify-center">
                  <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-phantom" />
                  <p className="mt-4 text-xs font-bold text-text-secondary">
                    {t.batch.preparing}
                  </p>
                </div>
              )}
              {jobs.map((job) => (
                <DownloadItemRow
                  key={job.id}
                  item={job}
                  onCancel={cancelDownload}
                  onRestart={restartDownload}
                  onRemove={removeDownload}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 border-y border-border/70 px-4 py-3 sm:px-5">
              <div className="w-[136px]">
                <StyledSelect
                  label={t.batch.fileFormat}
                  value={container}
                  onValueChange={(value) => setContainer(value as Container)}
                  options={containerOptions}
                  compact
                />
              </div>
              <div className="w-[160px]">
                <StyledSelect
                  label={t.batch.videoQuality}
                  value={quality}
                  onValueChange={(value) =>
                    setQuality(value as VideoQualityPreference)
                  }
                  options={qualityOptions}
                  compact
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    allSelected
                      ? new Set()
                      : new Set(videos.map((video) => video.id))
                  )
                }
                className="ml-auto flex h-11 items-center gap-2 rounded-xl px-2 text-[12px] font-bold text-text-secondary transition-colors hover:text-text"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                    allSelected
                      ? "border-phantom bg-phantom text-white"
                      : "border-border bg-surface"
                  }`}
                >
                  {allSelected && <IconCheck size={12} stroke={3} />}
                </span>
                {allSelected ? t.batch.deselectAll : t.batch.selectAll}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-1 sm:px-5">
              <VideoList
                videos={videos}
                selectable
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border/70 p-3 sm:px-5 sm:py-4">
          {settled ? (
            <button
              type="button"
              onClick={backToSelection}
              className="flex h-11 items-center gap-1.5 rounded-xl pl-2 pr-3 text-[13px] font-bold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
            >
              <IconArrowLeft size={16} stroke={2.2} />
              {t.batch.back}
            </button>
          ) : (
            <p className="text-[12px] text-text-tertiary">
              {started
                ? t.queue.keepOpen
                : selectedVideos.length === 0
                  ? t.batch.selectOne
                  : ""}
            </p>
          )}
          <div className="flex gap-1">
            {started ? (
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl bg-phantom px-5 text-[13px] font-bold text-white transition-colors hover:bg-phantom-dark"
              >
                {t.batch.done}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-xl px-4 text-[13px] font-bold text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
                >
                  {t.batch.cancel}
                </button>
                <button
                  type="button"
                  onClick={start}
                  disabled={selectedVideos.length === 0}
                  className="flex h-11 items-center gap-2 rounded-xl bg-phantom px-5 text-[13px] font-bold text-white transition-colors hover:bg-phantom-dark disabled:cursor-not-allowed disabled:bg-transparent disabled:text-text-tertiary disabled:shadow-[inset_0_0_0_1px_var(--color-border)]"
                >
                  <IconDownload size={16} stroke={2.1} />
                  {t.batch.add}
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
