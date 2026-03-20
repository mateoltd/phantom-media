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
import { DEFAULT_PARALLEL_LIMIT } from "@/lib/constants";
import { generateId, generateFileName } from "@/lib/utils";
import { USE_WS_BRIDGE } from "@/lib/config";

export interface DownloadStoreState {
  // Downloads
  downloads: DownloadItem[];

  // Settings
  parallelLimit: number;
  lastContainer: Container;
  lastQualityPreference: VideoQualityPreference;

  // Actions
  addDownload: (video: VideoInfo, option: DownloadOption, index?: number) => string;
  updateDownload: (
    id: string,
    updates: Partial<Pick<DownloadItem, "status" | "progress" | "errorMessage">>
  ) => void;
  removeDownload: (id: string) => void;
  removeCompletedDownloads: () => void;
  removeInactiveDownloads: () => void;
  restartDownload: (id: string) => void;
  restartFailedDownloads: () => void;
  cancelDownload: (id: string) => void;
  cancelAllDownloads: () => void;
  clearDownloads: () => void;

  // Settings actions
  setParallelLimit: (limit: number) => void;
  setLastContainer: (container: Container) => void;
  setLastQualityPreference: (pref: VideoQualityPreference) => void;
}

export const useDownloadStore = create<DownloadStoreState>()(
  persist(
    (set) => ({
      // Initial state
      downloads: [],
      parallelLimit: DEFAULT_PARALLEL_LIMIT,
      lastContainer: "mp4",
      lastQualityPreference: "highest",

      // Download actions
      addDownload: (video, option, index) => {
        const id = generateId();
        const item: DownloadItem = {
          id,
          video,
          option,
          status: "enqueued",
          progress: 0,
          fileName: generateFileName(video.title, option.container, index),
          useBridge: USE_WS_BRIDGE,
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
              ? { ...d, status: "enqueued" as DownloadStatus, progress: 0, errorMessage: undefined }
              : d
          ),
        }));
      },

      restartFailedDownloads: () => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.status === "failed"
              ? { ...d, status: "enqueued" as DownloadStatus, progress: 0, errorMessage: undefined }
              : d
          ),
        }));
      },

      cancelDownload: (id) => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id &&
            (d.status === "enqueued" ||
              d.status === "started" ||
              d.status === "bridging" ||
              d.status === "uploading" ||
              d.status === "server_muxing" ||
              d.status === "receiving")
              ? { ...d, status: "canceled" as DownloadStatus }
              : d
          ),
        }));
      },

      cancelAllDownloads: () => {
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.status === "enqueued" ||
            d.status === "started" ||
            d.status === "bridging" ||
            d.status === "uploading" ||
            d.status === "server_muxing" ||
            d.status === "receiving"
              ? { ...d, status: "canceled" as DownloadStatus }
              : d
          ),
        }));
      },

      clearDownloads: () => {
        set({ downloads: [] });
      },

      // Settings actions
      setParallelLimit: (limit) => set({ parallelLimit: limit }),
      setLastContainer: (container) => set({ lastContainer: container }),
      setLastQualityPreference: (pref) =>
        set({ lastQualityPreference: pref }),
    }),
    {
      name: "ewyoutube-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        parallelLimit: state.parallelLimit,
        lastContainer: state.lastContainer,
        lastQualityPreference: state.lastQualityPreference,
      }),
    }
  )
);
