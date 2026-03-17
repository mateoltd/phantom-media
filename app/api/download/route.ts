import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { getYtDlpPath } from "@/lib/server/ytdlp";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for long videos

/**
 * Server-side download endpoint.
 * Spawns yt-dlp to download and pipes stdout directly to the response.
 * This lets yt-dlp handle YouTube's throttling with range requests/retries,
 * which is dramatically faster than resolving a URL and fetching it directly.
 *
 * Query params:
 *   videoId: YouTube video ID
 *   itag: specific itag (optional)
 *   type: 'video+audio' | 'video' | 'audio'
 *   quality: '360p' | '720p' | '1080p' | 'best' etc
 *   format: 'mp4' | 'webm'
 *   expectedSize: expected content-length in bytes (optional, for progress)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const videoId = searchParams.get("videoId");
  const formatSpecParam = searchParams.get("formatSpec");
  const itag = searchParams.get("itag");
  const type = searchParams.get("type") ?? "video+audio";
  const quality = searchParams.get("quality") ?? "best";
  const format = searchParams.get("format") ?? "mp4";
  if (!videoId) {
    return new Response("Missing videoId parameter", { status: 400 });
  }

  // Build yt-dlp format selector
  let formatSpec: string;
  if (formatSpecParam) {
    formatSpec = formatSpecParam;
  } else if (itag) {
    formatSpec = itag;
  } else if (type === "audio") {
    formatSpec =
      format === "webm"
        ? "bestaudio[ext=webm]"
        : "bestaudio[ext=m4a]/bestaudio";
  } else if (type === "video") {
    const heightFilter =
      quality !== "best" ? `[height<=${parseInt(quality)}]` : "";
    formatSpec =
      format === "webm"
        ? `bestvideo${heightFilter}[ext=webm]`
        : `bestvideo${heightFilter}[ext=mp4]`;
  } else {
    const heightFilter =
      quality !== "best" ? `[height<=${parseInt(quality)}]` : "";
    formatSpec = `best${heightFilter}[ext=${format}]/best${heightFilter}`;
  }

  try {
    const proc = spawn(getYtDlpPath(), [
      "-f",
      formatSpec,
      "-o",
      "-", // Output to stdout
      "--no-warnings",
      "--no-part",
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    let stderrBuf = "";
    proc.stderr.on("data", (data) => {
      stderrBuf += data.toString();
    });

    // Convert Node.js readable stream to Web ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        proc.stdout.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        proc.stdout.on("end", () => {
          controller.close();
        });

        proc.on("error", (err) => {
          controller.error(err);
        });

        proc.on("close", (code) => {
          if (code !== 0 && !proc.killed) {
            controller.error(
              new Error(stderrBuf.trim() || `yt-dlp exited with code ${code}`)
            );
          }
        });
      },
      cancel() {
        proc.kill("SIGTERM");
      },
    });

    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Access-Control-Allow-Origin", "*");
    // Don't set Content-Length — yt-dlp's output size may differ from metadata
    // estimates. The client tracks progress using expectedSize from stream info.
    headers.set("Transfer-Encoding", "chunked");

    return new Response(stream, { headers });
  } catch (error) {
    console.error("Download error:", error);
    const message =
      error instanceof Error ? error.message : "Download failed";
    return new Response(message, { status: 500 });
  }
}
