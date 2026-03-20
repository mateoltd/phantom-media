"use client";

import { useDownloadStore } from "@/stores/download-store";
import { executeDownload } from "./worker";
import type { DownloadItem } from "@/lib/types";

// Track active downloads and their abort controllers
const activeDownloads = new Map<string, AbortController>();
let processingQueue = false;

/**
 * Semaphore-based download manager.
 * Processes the download queue respecting the parallel limit.
 */
export function processQueue(): void {
  if (processingQueue) return;
  processingQueue = true;

  const check = () => {
    const state = useDownloadStore.getState();
    const { downloads, parallelLimit, updateDownload } = state;

    const activeCount = downloads.filter(
      (d) =>
        d.status === "started" ||
        d.status === "bridging" ||
        d.status === "uploading" ||
        d.status === "server_muxing" ||
        d.status === "receiving"
    ).length;
    const enqueued = downloads.filter((d) => d.status === "enqueued");

    // Start downloads up to the parallel limit
    const slotsAvailable = parallelLimit - activeCount;
    const toStart = enqueued.slice(0, Math.max(0, slotsAvailable));

    for (const item of toStart) {
      startDownload(item, updateDownload);
    }

    // Stop processing if nothing left to do
    if (
      enqueued.length === 0 &&
      downloads.filter((d) => d.status === "started").length === 0
    ) {
      processingQueue = false;
      return;
    }

    // Check again shortly
    setTimeout(check, 500);
  };

  check();
}

function startDownload(
  item: DownloadItem,
  updateDownload: (
    id: string,
    updates: Partial<Pick<DownloadItem, "status" | "progress" | "errorMessage">>
  ) => void
): void {
  const controller = new AbortController();
  activeDownloads.set(item.id, controller);

  // Watch for external cancellation
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
      onProgress: (progress) => {
        updateDownload(item.id, { progress });
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
    },
    item.useBridge ?? false
  );
}

/**
 * Cancel a specific download.
 */
export function cancelDownload(id: string): void {
  const controller = activeDownloads.get(id);
  if (controller) {
    controller.abort();
    activeDownloads.delete(id);
  }
  useDownloadStore.getState().cancelDownload(id);
}

/**
 * Cancel all active downloads.
 */
export function cancelAllDownloads(): void {
  for (const [id, controller] of activeDownloads) {
    controller.abort();
    activeDownloads.delete(id);
  }
  useDownloadStore.getState().cancelAllDownloads();
}
