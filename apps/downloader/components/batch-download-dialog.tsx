"use client";

import { useMemo, useState } from "react";
import { Check, DownloadSimple, X } from "@phosphor-icons/react/ssr";
import {
  Button,
  IconButton,
  Modal,
  ProgressRail,
  StyledSelect,
} from "@phantom/ui";
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
    !jobs.some((job) => job.status === "enqueued" || job.status === "started");

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
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="batch-dialog-title"
      width="max-w-2xl"
      height="h-[84svh] max-h-[94svh] sm:h-[660px] sm:max-h-[90vh]"
    >
      <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <h2
            id="batch-dialog-title"
            className="truncate text-lg font-extrabold tracking-[-0.02em] text-text"
          >
            {title}
          </h2>
          <p className="mt-1 text-[11px] text-text-tertiary">
            {started
              ? `${savedCount} of ${jobs.length || selectedVideos.length} ${t.queue.saved.toLowerCase()}`
              : `${selectedVideos.length} of ${videos.length} ${t.batch.selected}`}
          </p>
        </div>
        <IconButton
          label={t.batch.close}
          onClick={onClose}
          className="-mr-1 -mt-1"
        >
          <X weight="regular" size={17} />
        </IconButton>
      </div>

      {started ? (
        <>
          <div className="px-4 pb-4 sm:px-5">
            <ProgressRail
              percent={overallPercent}
              label={t.batch.running}
              done={savedCount === jobs.length && jobs.length > 0}
            />
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
                {allSelected && <Check weight="regular" size={12} />}
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
          <Button variant="ghost" onClick={backToSelection} className="pl-2 pr-3">
            {t.batch.back}
          </Button>
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
            <Button onClick={onClose}>{t.batch.done}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                {t.batch.cancel}
              </Button>
              <Button onClick={start} disabled={selectedVideos.length === 0}>
                <DownloadSimple weight="regular" size={16} />
                {t.batch.add}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
