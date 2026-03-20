/**
 * Server-side FFmpeg muxer using system FFmpeg.
 *
 * This is used by the WebSocket bridge for muxing on the server,
 * as opposed to the client-side ffmpeg.wasm muxer.
 */

import { spawn } from "child_process";
import { createReadStream } from "fs";
import { stat } from "fs/promises";

/**
 * Mux video and audio files using system FFmpeg
 */
export async function muxWithFFmpeg(
  videoPath: string,
  audioPath: string | null,
  outputPath: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  // Get input duration for progress calculation
  const duration = await getMediaDuration(videoPath);

  return new Promise((resolve, reject) => {
    const args: string[] = [];

    // Input files
    args.push("-i", videoPath);
    if (audioPath) {
      args.push("-i", audioPath);
    }

    // Copy streams without re-encoding
    args.push("-c", "copy");

    // Map streams
    if (audioPath) {
      args.push("-map", "0:v:0", "-map", "1:a:0");
    }

    // MP4-specific: faststart for web streaming
    if (outputPath.endsWith(".mp4")) {
      args.push("-movflags", "+faststart");
    }

    // Output
    args.push("-y", outputPath);

    // Progress reporting
    args.push("-progress", "pipe:2");

    const ffmpeg = spawn("ffmpeg", args);

    let lastProgress = 0;
    let stderrData = "";

    ffmpeg.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      stderrData += output;

      // Parse progress from stderr
      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch && duration > 0) {
        const currentMs = parseInt(timeMatch[1], 10) / 1000;
        const progress = Math.min(100, (currentMs / duration) * 100);
        if (progress > lastProgress) {
          lastProgress = progress;
          onProgress?.(Math.round(progress));
        }
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-500)}`));
      }
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`FFmpeg error: ${error.message}`));
    });
  });
}

/**
 * Convert audio file to a different format
 */
export async function convertAudio(
  inputPath: string,
  outputPath: string,
  format: "mp3" | "ogg",
  onProgress?: (progress: number) => void
): Promise<void> {
  const duration = await getMediaDuration(inputPath);

  return new Promise((resolve, reject) => {
    const args: string[] = ["-i", inputPath, "-vn"];

    // Codec settings
    if (format === "mp3") {
      args.push("-codec:a", "libmp3lame", "-q:a", "2");
    } else if (format === "ogg") {
      args.push("-codec:a", "libvorbis", "-q:a", "5");
    }

    args.push("-progress", "pipe:2", "-y", outputPath);

    const ffmpeg = spawn("ffmpeg", args);

    let lastProgress = 0;
    let stderrData = "";

    ffmpeg.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      stderrData += output;

      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch && duration > 0) {
        const currentMs = parseInt(timeMatch[1], 10) / 1000;
        const progress = Math.min(100, (currentMs / duration) * 100);
        if (progress > lastProgress) {
          lastProgress = progress;
          onProgress?.(Math.round(progress));
        }
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-500)}`));
      }
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`FFmpeg error: ${error.message}`));
    });
  });
}

/**
 * Get media duration in seconds using ffprobe
 */
async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    let output = "";

    ffprobe.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    ffprobe.on("close", () => {
      const duration = parseFloat(output.trim());
      resolve(isNaN(duration) ? 0 : duration * 1000); // Return ms
    });

    ffprobe.on("error", () => {
      resolve(0);
    });
  });
}

/**
 * Check if FFmpeg is available
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-version"]);

    ffmpeg.on("close", (code) => {
      resolve(code === 0);
    });

    ffmpeg.on("error", () => {
      resolve(false);
    });
  });
}
