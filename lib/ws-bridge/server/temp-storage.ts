/**
 * Temporary file storage for WebSocket bridge downloads.
 *
 * Manages:
 * - Creating temp directories per download
 * - Writing incoming chunks to disk
 * - Cleanup on completion or timeout
 */

import { mkdir, writeFile, appendFile, unlink, rm, stat, readFile } from "fs/promises";
import { createWriteStream, createReadStream, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { WS_TEMP_FILE_TTL_MS } from "@/lib/constants";

const TEMP_BASE = join(tmpdir(), "ewyoutube-bridge");

// Track temp directories for cleanup
const tempDirs = new Map<string, { createdAt: number; path: string }>();

// Cleanup interval
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
let cleanupTimer: NodeJS.Timeout | null = null;

async function ensureBaseDir() {
  try {
    await mkdir(TEMP_BASE, { recursive: true });
  } catch {
    // Already exists
  }
}

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupOldTempDirs, CLEANUP_INTERVAL);
}

async function cleanupOldTempDirs() {
  const now = Date.now();
  for (const [downloadId, info] of tempDirs) {
    if (now - info.createdAt > WS_TEMP_FILE_TTL_MS) {
      await cleanupTempDir(downloadId);
    }
  }
}

/**
 * Create a temp directory for a download
 */
export async function createTempDir(downloadId: string): Promise<string> {
  await ensureBaseDir();

  const dirPath = join(TEMP_BASE, downloadId);
  await mkdir(dirPath, { recursive: true });

  tempDirs.set(downloadId, {
    createdAt: Date.now(),
    path: dirPath,
  });

  startCleanupTimer();

  return dirPath;
}

/**
 * Get temp file paths for a download
 */
export function getTempPaths(downloadId: string): {
  dir: string;
  video: string;
  audio: string;
  output: string;
} {
  const dir = join(TEMP_BASE, downloadId);
  return {
    dir,
    video: join(dir, "video.part"),
    audio: join(dir, "audio.part"),
    output: join(dir, "output"),
  };
}

/**
 * Write a chunk to a temp file at a specific offset
 */
export async function writeChunk(
  filePath: string,
  data: Uint8Array,
  offset: number
): Promise<void> {
  // For initial writes or sequential appends, use appendFile
  // For out-of-order writes, we'd need random access (but our protocol ensures order)
  const stats = await stat(filePath).catch(() => null);
  const currentSize = stats?.size ?? 0;

  if (offset === currentSize) {
    // Sequential append
    await appendFile(filePath, data);
  } else if (offset === 0 && currentSize === 0) {
    // First write
    await writeFile(filePath, data);
  } else {
    // Out of order - read, patch, write (should be rare)
    // For simplicity, we trust the protocol ensures ordering
    throw new Error(`Out of order write: offset=${offset}, currentSize=${currentSize}`);
  }
}

/**
 * Create a write stream for streaming writes
 */
export function createTempWriteStream(filePath: string): ReturnType<typeof createWriteStream> {
  return createWriteStream(filePath, { flags: "a" });
}

/**
 * Get file size
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Check if temp file exists
 */
export async function tempFileExists(filePath: string): Promise<boolean> {
  return existsSync(filePath);
}

/**
 * Compute SHA-256 hash of a file
 */
export async function computeFileHash(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest()));
    stream.on("error", reject);
  });
}

/**
 * Read a temp file
 */
export async function readTempFile(filePath: string): Promise<Buffer> {
  return readFile(filePath);
}

/**
 * Create a read stream for a temp file
 */
export function createTempReadStream(filePath: string): ReturnType<typeof createReadStream> {
  return createReadStream(filePath);
}

/**
 * Clean up temp directory for a download
 */
export async function cleanupTempDir(downloadId: string): Promise<void> {
  const info = tempDirs.get(downloadId);
  if (!info) return;

  try {
    await rm(info.path, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }

  tempDirs.delete(downloadId);
}

/**
 * Delete a specific temp file
 */
export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Ignore errors
  }
}

/**
 * Get resume checkpoint for a download
 */
export async function getResumeCheckpoint(downloadId: string): Promise<{
  videoOffset: number;
  audioOffset: number;
} | null> {
  const paths = getTempPaths(downloadId);

  const videoSize = await getFileSize(paths.video);
  const audioSize = await getFileSize(paths.audio);

  if (videoSize === 0 && audioSize === 0) {
    return null;
  }

  return {
    videoOffset: videoSize,
    audioOffset: audioSize,
  };
}

/**
 * Get temp storage stats
 */
export function getTempStorageStats(): {
  activeDownloads: number;
  directories: { downloadId: string; createdAt: number; ageMs: number }[];
} {
  const now = Date.now();
  return {
    activeDownloads: tempDirs.size,
    directories: Array.from(tempDirs.entries()).map(([downloadId, info]) => ({
      downloadId,
      createdAt: info.createdAt,
      ageMs: now - info.createdAt,
    })),
  };
}
