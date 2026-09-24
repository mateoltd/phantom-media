"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadSimple, X } from "@phosphor-icons/react/ssr";
import { Button, IconButton, ProgressRail } from "@phantom/ui";
import { downloadVod, type DownloadProgress } from "@/lib/download";

interface Quality {
  key: string;
  name: string;
  resolution: string;
  frameRate: number;
  bandwidth: number;
  codec: string;
  playlistUrl: string;
}

interface DownloadButtonProps {
  qualities: Quality[];
  channel: string;
  vodId: string;
  iconOnly?: boolean;
}

type DownloadState =
  | { status: "idle" }
  | { status: "picking" }
  | { status: "downloading"; progress: DownloadProgress; qualityName: string }
  | { status: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function DownloadButton({
  qualities,
  channel,
  vodId,
  iconOnly = false,
}: DownloadButtonProps) {
  const [state, setState] = useState<DownloadState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (state.status !== "picking") return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setState({ status: "idle" });
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setState({ status: "idle" });
        menuRef.current?.querySelector<HTMLButtonElement>("[data-download-trigger]")?.focus();
      }
    }
    menuRef.current?.querySelector<HTMLButtonElement>("[data-quality-option]")?.focus();
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [state.status]);

  useEffect(() => {
    if (state.status !== "error") return;
    const timeout = setTimeout(() => setState({ status: "idle" }), 4000);
    return () => clearTimeout(timeout);
  }, [state.status]);

  const handleDownload = useCallback(
    async (quality: Quality) => {
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: "downloading",
        progress: { phase: "fetching", downloaded: 0, total: 0, bytes: 0 },
        qualityName: quality.name,
      });

      try {
        await downloadVod(
          quality.playlistUrl,
          `${channel}_${vodId}_${quality.key}`,
          (progress) => {
            setState((prev) =>
              prev.status === "downloading" ? { ...prev, progress } : prev
            );
          },
          controller.signal
        );
        setState({ status: "idle" });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setState({ status: "idle" });
          return;
        }
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Download failed",
        });

      } finally {
        abortRef.current = null;
      }
    },
    [channel, vodId]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /* ── Downloading ── */
  if (state.status === "downloading") {
    const { progress, qualityName } = state;
    const pct =
      progress.total > 0
        ? Math.round((progress.downloaded / progress.total) * 100)
        : 0;

    if (iconOnly) return (
      <button type="button" className="twitch-rail-action twitch-rail-downloading" onClick={cancel}
        aria-label={`Cancel download (${pct}%)`} data-tooltip={`${qualityName}: ${pct}% / ${formatBytes(progress.bytes)}. Click to cancel.`}>
        <svg className="twitch-download-ring" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="19" fill="none" stroke="currentColor" strokeWidth="2" pathLength="100" strokeDasharray={`${pct} 100`} transform="rotate(-90 22 22)" />
        </svg>
        <X size={19} />
        <span className="sr-only" role="status">Downloading {qualityName}</span>
      </button>
    );

    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-text-secondary">
                {qualityName}
              </span>
              <span className="text-[10px] tabular-nums text-text-tertiary">
                {pct}% / {formatBytes(progress.bytes)}
              </span>
            </div>
            <ProgressRail percent={pct} label="Download progress" slim className="w-24" />
          </div>
        </div>
        <IconButton label="Cancel download" onClick={cancel} size="sm">
          <X weight="regular" size={12} />
        </IconButton>
      </div>
    );
  }

  /* ── Error ── */
  if (state.status === "error") {
    if (iconOnly) return (
      <button type="button" className="twitch-rail-action text-red-400" aria-label="Download failed. Try again" data-tooltip={state.message} onClick={() => setState({ status: "picking" })}>
        <DownloadSimple size={21} />
        <span className="sr-only" role="alert">{state.message}</span>
      </button>
    );
    return (
      <span className="text-[11px] font-medium text-red-400/80">
        {state.message}
      </span>
    );
  }

  /* ── Idle / Picking ── */
  return (
    <div className="relative" ref={menuRef}>
      <Button
        data-download-trigger
        aria-label="Download video"
        aria-expanded={state.status === "picking"}
        variant="secondary"
        disabled={qualities.length === 0}
        onClick={() =>
          setState((prev) =>
            prev.status === "picking"
              ? { status: "idle" }
              : { status: "picking" }
          )
        }
        className={iconOnly ? "twitch-rail-action" : "h-9 px-3 text-[11px]"}
      >
        <DownloadSimple weight="regular" size={iconOnly ? 21 : 12} />
        {!iconOnly && "Download"}
      </Button>

      {state.status === "picking" && (
        <div className={`panel-soft absolute z-50 w-56 overflow-hidden rounded-xl p-1 animate-panel-in ${iconOnly ? "twitch-rail-download-menu" : "right-0 top-full mt-1.5"}`}>
          <p className="px-2.5 py-1.5 text-[11px] font-medium text-text-tertiary">
            Select quality
          </p>
          {qualities.map((q) => (
            <button
              key={q.key}
              data-quality-option
              onClick={() => handleDownload(q)}
              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-text-secondary">
                  {q.name}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {q.resolution}
                </span>
              </div>
              <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-text-tertiary">
                {q.codec.startsWith("hev") ? "HEVC" : "H.264"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
