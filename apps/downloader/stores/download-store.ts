"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  DownloadItem,
  DownloadStatus,
  VideoInfo,
  DownloadOption,
  Container,
  VideoQualityPreference,
} from "@/lib/types";
import { generateId, generateFileName } from "@/lib/utils";

export interface DownloadStoreState {
  downloads: DownloadItem[];

  lastContainer: Container;
  lastQualityPreference: VideoQualityPreference;

  addDownload: (video: VideoInfo, option: DownloadOption, index?: number) => string;
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
  ) => void;
  removeDownload: (id: string) => void;
  removeCompletedDownloads: () => void;
  removeInactiveDownloads: () => void;
  restartDownload: (id: string) => void;
  restartFailedDownloads: () => void;
  cancelDownload: (id: string) => void;
  cancelAllDownloads: () => void;

  setLastContainer: (container: Container) => void;
  setLastQualityPreference: (pref: VideoQualityPreference) => void;
}

export const useDownloadStore = create<DownloadStoreState>()(
  persist(
    (set) => ({
      downloads: [],
      lastContainer: "mp4",
      lastQualityPreference: "highest",

      addDownload: (video, option, index) => {
        const id = generateId();
        const item: DownloadItem = {
          id,
          video,
          option,
          status: "enqueued",
          progress: 0,
          phase: "queued",
          fileName: generateFileName(video.title, option.container, index),
        };
        set((state) => ({
          downloads: [...state.downloads, item],
        }));
        return id;
      },

      updateDownload: (id, updates) => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        }));
      },

      removeDownload: (id) => {
        set((state) => ({
          downloads: state.downloads.filter((d) => d.id !== id),
        }));
      },

      removeCompletedDownloads: () => {
        set((state) => ({
          downloads: state.downloads.filter((d) => d.status !== "completed"),
        }));
      },

      removeInactiveDownloads: () => {
        set((state) => ({
          downloads: state.downloads.filter(
            (d) =>
              d.status !== "completed" &&
              d.status !== "failed" &&
              d.status !== "canceled"
          ),
        }));
      },

      restartDownload: (id) => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: "enqueued" as DownloadStatus,
                  progress: 0,
                  phase: "queued" as const,
                  downloadedBytes: undefined,
                  totalBytes: undefined,
                  bytesPerSecond: undefined,
                  etaSeconds: undefined,
                  errorMessage: undefined,
                }
              : d
          ),
        }));
      },

      restartFailedDownloads: () => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.status === "failed"
              ? {
                  ...d,
                  status: "enqueued" as DownloadStatus,
                  progress: 0,
                  phase: "queued" as const,
                  downloadedBytes: undefined,
                  totalBytes: undefined,
                  bytesPerSecond: undefined,
                  etaSeconds: undefined,
                  errorMessage: undefined,
                }
              : d
          ),
        }));
      },

      cancelDownload: (id) => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id &&
            (d.status === "enqueued" ||
              d.status === "started")
              ? { ...d, status: "canceled" as DownloadStatus }
              : d
          ),
        }));
      },

      cancelAllDownloads: () => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.status === "enqueued" ||
            d.status === "started"
              ? { ...d, status: "canceled" as DownloadStatus }
              : d
          ),
        }));
      },

      setLastContainer: (container) => set({ lastContainer: container }),
      setLastQualityPreference: (pref) =>
        set({ lastQualityPreference: pref }),
    }),
    {
      name: "ewyoutube-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lastContainer: state.lastContainer,
        lastQualityPreference: state.lastQualityPreference,
      }),
    }
  )
);
