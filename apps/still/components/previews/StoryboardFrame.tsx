"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ResourceCache } from "@/lib/cache";
import { MAX_STORYBOARD_SHEET_PIXELS, type StoryboardFrame as Frame } from "@/lib/previews/storyboards";
import { formatTime } from "@/lib/format";

// Retain decoded sheets, not copies of every sampled frame. In-flight loads are bounded too.
const sheets = new ResourceCache<HTMLImageElement>(4, MAX_STORYBOARD_SHEET_PIXELS, image => image.naturalWidth * image.naturalHeight);
function loadSheet(url: string, signal: AbortSignal) {
  return sheets.load(url, () => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => finish(new Error("Frame load timed out")), 15_000);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ""; reject(error); } else resolve(image);
    };
    image.onload = () => {
      if (image.naturalWidth * image.naturalHeight > MAX_STORYBOARD_SHEET_PIXELS) { finish(new Error("Frame sheet too large")); return; }
      void image.decode().then(() => finish(), () => finish(new Error("Frame decode failed")));
    };
    image.onerror = () => finish(new Error("Frame unavailable"));
    image.src = `/api/proxy?url=${encodeURIComponent(url)}`;
  }), 60_000, signal);
}

/** Cropping and decode status are local to this canvas; the player never owns image work. */
export function StoryboardFrame({ frame, children }: { frame: Frame; children?: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = `${frame.url}:${frame.sourceX}:${frame.sourceY}`;
  const [result, setResult] = useState<{ key: string; status: "ready" | "error" }>();
  const status = result?.key === key ? result.status : "loading";
  useEffect(() => {
    const controller = new AbortController();
    void loadSheet(frame.url, controller.signal).then(image => {
      if (controller.signal.aborted) return;
      if (image.naturalWidth < frame.sourceX + frame.width || image.naturalHeight < frame.sourceY + frame.height) throw new Error("Frame outside decoded sheet");
      const context = canvas.current?.getContext("2d");
      if (!context) throw new Error("Frame canvas unavailable");
      context.clearRect(0, 0, frame.width, frame.height);
      context.drawImage(image, frame.sourceX, frame.sourceY, frame.width, frame.height, 0, 0, frame.width, frame.height);
      setResult({ key, status: "ready" });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, status: "error" });
    });
    return () => controller.abort();
  }, [frame.url, frame.sourceX, frame.sourceY, frame.width, frame.height, key]);
  return <div className="still-storyboard-frame">
    <canvas ref={canvas} width={frame.width} height={frame.height} role="img" aria-label={`Sampled frame near ${formatTime(frame.position)}`} data-ready={status === "ready" || undefined} />
    {status !== "ready" && <span role="status">{status === "error" ? "Frame unavailable" : "Loading frame…"}</span>}
    {children}
  </div>;
}
