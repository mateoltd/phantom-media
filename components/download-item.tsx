"use client";

import Image from "next/image";
import { IconCheck, IconRefresh, IconTrash, IconX } from "@tabler/icons-react";
import type { DownloadItem as DownloadItemType } from "@/lib/types";
import { containerDisplayName, formatFileSize } from "@/lib/types";
import { useI18n } from "@/components/locale-provider";
import { getPhaseLabel, getProgressStats } from "@/components/download-progress";

interface DownloadItemProps {
  item: DownloadItemType;
  onCancel: (id: string) => void;
  onRestart: (id: string) => void;
  onRemove: (id: string) => void;
}

export function DownloadItemRow({
  item,
  onCancel,
  onRestart,
  onRemove,
}: DownloadItemProps) {
  const { messages: t } = useI18n();
  const completed = item.status === "completed";
  const failed = item.status === "failed";
  const running = item.status === "started" && item.phase !== "queued";
  const active = item.status === "started" || item.status === "enqueued";
  const percent = completed ? 100 : Math.round(item.progress * 100);
  const stats = getProgressStats(item, t.queue);

  const specs = [containerDisplayName(item.option.container)];
  if (item.option.qualityLabel) specs.push(item.option.qualityLabel);
  if (item.option.isAudioOnly) specs.push(t.queue.audio);
  if (item.option.totalSize > 0) specs.push(formatFileSize(item.option.totalSize));

  return (
    <article className="job-row">
      <div className="flex gap-3">
        <div className="relative h-[50px] w-[88px] shrink-0 overflow-hidden rounded-lg bg-[#ded9cf]">
          <Image
            src={item.video.thumbnailUrl}
            alt=""
            fill
            sizes="88px"
            unoptimized
            className="h-full w-full object-cover"
          />
          {completed && (
            <span className="absolute inset-0 flex items-center justify-center bg-success/85 text-white">
              <IconCheck size={18} stroke={2.6} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 min-w-0 flex-1 text-[13px] font-bold leading-[1.35] text-text">
              {item.video.title}
            </p>
            <div className="-mt-1 flex shrink-0 items-center">
              {(item.status === "enqueued" ||
                (item.status === "started" &&
                  item.phase !== "transferring")) && (
                <RowAction label={t.queue.cancel} onClick={() => onCancel(item.id)}>
                  <IconX size={14} stroke={2.2} />
                </RowAction>
              )}
              {(failed || item.status === "canceled") && (
                <RowAction
                  label={t.queue.restart}
                  onClick={() => onRestart(item.id)}
                >
                  <IconRefresh size={14} stroke={2.2} />
                </RowAction>
              )}
              {(completed || failed || item.status === "canceled") && (
                <RowAction label={t.queue.remove} onClick={() => onRemove(item.id)}>
                  <IconTrash size={14} stroke={2} />
                </RowAction>
              )}
            </div>
          </div>

          <p className="mt-1 font-mono text-[10px] text-text-tertiary">
            {specs.join(", ")}
          </p>

          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span
              className={`text-[11px] font-bold ${
                completed
                  ? "text-success"
                  : failed
                    ? "text-error"
                    : running
                      ? "text-text"
                      : "text-text-secondary"
              }`}
            >
              {getPhaseLabel(item, t.queue)}
            </span>
            <span className="shrink-0 font-mono text-[11px] font-bold text-text">
              {percent}%
            </span>
          </div>

          {stats && (
            <p className="mt-1 font-mono text-[10px] text-text-tertiary">
              {stats}
            </p>
          )}

          {item.errorMessage && (
            <p className="mt-2 text-[11px] leading-4 text-error">
              {item.errorMessage}
            </p>
          )}
        </div>
      </div>

      {active && (
        <span
          className="job-rail job-rail-slim mt-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={item.video.title}
        >
          {running && percent === 0 ? (
            <span className="job-rail-indeterminate" />
          ) : (
            <span
              className={`job-fill ${running ? "" : "job-fill-idle"}`}
              style={{ width: `${percent}%` }}
            />
          )}
        </span>
      )}
    </article>
  );
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
