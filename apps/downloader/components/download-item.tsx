"use client";

import Image from "next/image";
import { Check, RefreshCw, Trash2, X } from "lucide-react";
import { IconButton, ProgressRail } from "@phantom/ui";
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
              <Check size={18} strokeWidth={2.6} />
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
                  <X size={14} strokeWidth={2.2} />
                </RowAction>
              )}
              {(failed || item.status === "canceled") && (
                <RowAction
                  label={t.queue.restart}
                  onClick={() => onRestart(item.id)}
                >
                  <RefreshCw size={14} strokeWidth={2.2} />
                </RowAction>
              )}
              {(completed || failed || item.status === "canceled") && (
                <RowAction label={t.queue.remove} onClick={() => onRemove(item.id)}>
                  <Trash2 size={14} strokeWidth={2} />
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
        <ProgressRail
          slim
          className="mt-3"
          percent={percent}
          label={item.video.title}
          indeterminate={running && percent === 0}
          idle={!running}
        />
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
    <IconButton size="sm" label={label} onClick={onClick} className="rounded-lg">
      {children}
    </IconButton>
  );
}
