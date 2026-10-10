"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadMedia, prepareDownload, type PreparedDownload } from "@/lib/downloads/download";
import type { DownloadProgress } from "@/lib/downloads/types";
import type { MediaVariant } from "@/lib/contracts";

type DownloadState =
  | { status: "idle" }
  | { status: "picking" }
  | { status: "preparing"; qualityName: string }
  | { status: "ready"; prepared: PreparedDownload }
  | { status: "downloading"; progress: DownloadProgress; qualityName: string }
  | { status: "error"; message: string };

export function useDownload(channel: string, vodId: string, clipSlug?: string) {
  const [state, setState] = useState<DownloadState>({ status: "idle" });
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, [channel, vodId]);

  const prepare = useCallback(async (quality: MediaVariant) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState({ status: "preparing", qualityName: quality.name });
    try {
      const prepared = await prepareDownload(quality, `${channel}_${vodId}_${quality.key}`, controller.signal);
      if (active.current === controller && !controller.signal.aborted) setState({ status: "ready", prepared });
    } catch (error) {
      if (active.current === controller && !controller.signal.aborted) setState({ status: "error", message: error instanceof Error ? error.message : "Download preparation failed" });
    } finally { if (active.current === controller) active.current = null; }
  }, [channel, vodId]);

  const save = useCallback(async () => {
    if (state.status !== "ready" || active.current) return;
    const { prepared } = state;
    const quality = prepared.variant;
    const controller = new AbortController();
    active.current = controller;
    setState({ status: "downloading", progress: { phase: "fetching", downloaded: 0, total: 0, bytes: 0 }, qualityName: quality.name });
    try {
      await downloadMedia(prepared, progress => {
        if (active.current === controller) setState(previous => previous.status === "downloading" ? { ...previous, progress } : previous);
      }, controller.signal, clipSlug ? async () => {
        const response = await fetch(`/api/clip/resolve?slug=${encodeURIComponent(clipSlug)}&refresh=1`, { signal: controller.signal });
        if (!response.ok) throw new Error("Clip signing refresh failed");
        const data = await response.json() as { qualities: MediaVariant[] };
        const variant = data.qualities.find(item => item.key === quality.key);
        if (!variant || variant.delivery !== "file") throw new Error("Clip quality is unavailable");
        return { url: variant.playlistUrl, identity: variant.identity };
      } : undefined);
      if (active.current === controller) setState({ status: "idle" });
    } catch (error) {
      if (active.current !== controller) return;
      setState(error instanceof DOMException && error.name === "AbortError" ? { status: "idle" } : { status: "error", message: error instanceof Error ? error.message : "Download failed" });
    } finally { if (active.current === controller) active.current = null; }
  }, [state, clipSlug]);

  const cancel = useCallback(() => { active.current?.abort(); active.current = null; setState({ status: "idle" }); }, []);
  return { state, setState, prepare, save, cancel };
}
