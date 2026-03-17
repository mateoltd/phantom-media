import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getYtDlpPath } from "@/lib/server/ytdlp";

export const runtime = "nodejs";

/**
 * Lightweight URL resolver — spawns a single yt-dlp to get direct CDN URLs.
 * Much faster than /api/download which also proxies the full stream.
 *
 * POST body: { videoId, formatSpec }
 *   formatSpec: yt-dlp format string like "137" or "137+140"
 *
 * Returns: { urls: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const { videoId, formatSpec } = await request.json();

    if (!videoId || !formatSpec) {
      return NextResponse.json(
        { error: "Missing videoId or formatSpec" },
        { status: 400 }
      );
    }

    const urls = await resolveUrls(videoId, formatSpec);
    return NextResponse.json({ urls });
  } catch (error) {
    console.error("stream-urls error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to resolve URLs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function resolveUrls(
  videoId: string,
  formatSpec: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getYtDlpPath(), [
      "-g",
      "-f",
      formatSpec,
      "--no-warnings",
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }
      const urls = stdout
        .trim()
        .split("\n")
        .filter((u) => u.length > 0);
      if (urls.length === 0) {
        reject(new Error("No URLs returned by yt-dlp"));
        return;
      }
      resolve(urls);
    });

    proc.on("error", (err) => reject(err));
  });
}
