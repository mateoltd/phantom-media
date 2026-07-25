"use client";

import { useDownloadStore } from "@/stores/download-store";

export function useSettings() {
  const lastContainer = useDownloadStore((s) => s.lastContainer);
  const lastQualityPreference = useDownloadStore((s) => s.lastQualityPreference);
  const setLastContainer = useDownloadStore((s) => s.setLastContainer);
  const setLastQualityPreference = useDownloadStore((s) => s.setLastQualityPreference);

  return {
    lastContainer,
    lastQualityPreference,
    setLastContainer,
    setLastQualityPreference,
  };
}
