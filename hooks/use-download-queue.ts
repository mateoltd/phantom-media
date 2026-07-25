"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDownloadStore } from "@/stores/download-store";
import { processQueue, cancelDownload, cancelAllDownloads } from "@/lib/download/manager";
import type { VideoInfo, DownloadOption } from "@/lib/types";

export function useDownloadQueue() {
  const downloads = useDownloadStore((s) => s.downloads);
  const addDownload = useDownloadStore((s) => s.addDownload);
  const removeDownload = useDownloadStore((s) => s.removeDownload);
  const removeCompletedDownloads = useDownloadStore((s) => s.removeCompletedDownloads);
  const removeInactiveDownloads = useDownloadStore((s) => s.removeInactiveDownloads);
  const restartDownload = useDownloadStore((s) => s.restartDownload);
  const restartFailedDownloads = useDownloadStore((s) => s.restartFailedDownloads);
  const prevEnqueuedCount = useRef(0);

  useEffect(() => {
    const enqueuedCount = downloads.filter((d) => d.status === "enqueued").length;
    if (enqueuedCount > prevEnqueuedCount.current) {
      processQueue();
    }
    prevEnqueuedCount.current = enqueuedCount;
  }, [downloads]);

  const enqueue = useCallback(
    (video: VideoInfo, option: DownloadOption, index?: number) => {
      const id = addDownload(video, option, index);
      return id;
    },
    [addDownload]
  );

  const enqueueBatch = useCallback(
    (items: { video: VideoInfo; option: DownloadOption }[]) => {
      const ids: string[] = [];
      items.forEach((item, index) => {
        ids.push(addDownload(item.video, item.option, index));
      });
      return ids;
    },
    [addDownload]
  );

  return {
    downloads,
    enqueue,
    enqueueBatch,
    cancelDownload,
    cancelAllDownloads,
    removeDownload,
    removeCompletedDownloads,
    removeInactiveDownloads,
    restartDownload,
    restartFailedDownloads,
  };
}
