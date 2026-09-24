"use client";

import { ProgressRail } from "@phantom/ui";
import type { DownloadItem } from "@/lib/types";
import { formatFileSize } from "@/lib/types";
import { useI18n } from "@/components/locale-provider";
import type { Messages } from "@/lib/i18n";

export function DownloadProgress({ item }: { item: DownloadItem }) {
  const { messages: t } = useI18n();
  const completed = item.status === "completed";
  const failed = item.status === "failed";
  const running = item.status === "started" && item.phase !== "queued";
  const percent = completed ? 100 : Math.round(item.progress * 100);
  const stats = getProgressStats(item, t.queue);

  return (
    <div className="py-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`text-[13px] font-extrabold ${
              completed
                ? "text-success"
                : failed
                  ? "text-error"
                  : "text-text"
            }`}
          >
            {getPhaseLabel(item, t.queue)}
          </p>
          <p className="mt-1.5 min-h-4 text-[11px] text-text-tertiary">
            {stats}
          </p>
        </div>
        <p
          className={`shrink-0 text-[40px] font-extrabold leading-none tracking-[-0.05em] tabular-nums ${
            failed ? "text-text-tertiary" : "text-text"
          }`}
        >
          {percent}
          <span className="text-[20px] text-text-tertiary">%</span>
        </p>
      </div>

      <ProgressRail
        className="mt-4"
        percent={percent}
        label={item.video.title}
        indeterminate={running && percent === 0}
        done={completed}
        idle={!completed && !running}
      />

      {item.errorMessage && (
        <p className="mt-3 text-[12px] leading-5 text-error">
          {item.errorMessage}
        </p>
      )}
    </div>
  );
}

export function getPhaseLabel(
  item: DownloadItem,
  copy: Messages["queue"]
): string {
  if (item.status === "failed") return copy.failed;
  if (item.status === "canceled") return copy.canceled;
  if (item.status === "completed") return copy.savedByBrowser;

  switch (item.phase) {
    case "queued":
      return copy.waitingToStart;
    case "resolving":
      return copy.resolving;
    case "downloading":
      return copy.downloading;
    case "processing":
      return item.option.isAudioOnly ? copy.converting : copy.muxing;
    case "ready":
      return copy.opening;
    case "transferring":
      return copy.transferring;
    case "complete":
      return copy.savedByBrowser;
    default:
      return item.status === "started" ? copy.preparing : copy.queued;
  }
}

export function getProgressStats(
  item: DownloadItem,
  copy: Messages["queue"]
): string {
  if (item.status === "completed") return copy.complete;
  if (item.status !== "started" && item.status !== "enqueued") return "";

  const parts: string[] = [];
  if (
    typeof item.downloadedBytes === "number" &&
    typeof item.totalBytes === "number" &&
    item.totalBytes > 0
  ) {
    parts.push(
      `${formatFileSize(item.downloadedBytes)} of ${formatFileSize(item.totalBytes)}`
    );
  }
  if (typeof item.bytesPerSecond === "number" && item.bytesPerSecond > 0) {
    parts.push(`${formatFileSize(item.bytesPerSecond)}/s`);
  }
  if (typeof item.etaSeconds === "number" && item.etaSeconds > 0) {
    parts.push(`${formatEta(item.etaSeconds)} ${copy.left}`);
  }
  return parts.join(", ");
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.ceil(seconds % 60);
  return `${minutes}m ${remainder}s`;
}
