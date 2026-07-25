"use client";

import { useDownloadStore } from "@/stores/download-store";
import { executeDownload } from "./worker";
import type { DownloadItem } from "@/lib/types";
import { DEFAULT_PARALLEL_LIMIT } from "@/lib/constants";

const activeDownloads = new Map<string, AbortController>();
let processingQueue = false;

export function processQueue(): void {
  if (processingQueue) return;
  processingQueue = true;

  const check = () => {
    const state = useDownloadStore.getState();
    const { downloads, updateDownload } = state;

    const activeCount = downloads.filter(
      (d) => d.status === "started"
    ).length;
    const enqueued = downloads.filter((d) => d.status === "enqueued");

    const slotsAvailable = DEFAULT_PARALLEL_LIMIT - activeCount;
    const toStart = enqueued.slice(0, Math.max(0, slotsAvailable));

    for (const item of toStart) {
      startDownload(item, updateDownload);
    }

    if (
      enqueued.length === 0 &&
      downloads.filter((d) => d.status === "started").length === 0
    ) {
      processingQueue = false;
      return;
    }

    setTimeout(check, 500);
  };

  check();
}

function startDownload(
  item: DownloadItem,
  updateDownload: (
    id: string,
    updates: Partial<
      Pick<
        DownloadItem,
        | "status"
        | "progress"
        | "phase"
        | "downloadedBytes"
        | "totalBytes"
        | "bytesPerSecond"
        | "etaSeconds"
        | "errorMessage"
      >
    >
  ) => void
): void {
  const controller = new AbortController();
  activeDownloads.set(item.id, controller);

  const unsubscribe = useDownloadStore.subscribe((state) => {
    const current = state.downloads.find((d) => d.id === item.id);
    if (current?.status === "canceled") {
      controller.abort();
      activeDownloads.delete(item.id);
      unsubscribe();
    }
  });

  executeDownload(
    item.option,
    item.video.id,
    item.fileName,
    {
      onProgress: (progress, details) => {
        updateDownload(item.id, { progress, ...details });
      },
      onStatusChange: (status) => {
        updateDownload(item.id, { status });
        if (status === "completed" || status === "failed") {
          activeDownloads.delete(item.id);
          unsubscribe();
        }
      },
      onError: (message) => {
        updateDownload(item.id, { errorMessage: message });
      },
      signal: controller.signal,
    }
  );
}

export function cancelDownload(id: string): void {
  const controller = activeDownloads.get(id);
  if (controller) {
    controller.abort();
    activeDownloads.delete(id);
  }
  useDownloadStore.getState().cancelDownload(id);
}

export function cancelAllDownloads(): void {
  for (const [id, controller] of activeDownloads) {
    controller.abort();
    activeDownloads.delete(id);
  }
  useDownloadStore.getState().cancelAllDownloads();
}
