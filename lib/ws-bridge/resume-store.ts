/**
 * IndexedDB persistence for resume state.
 *
 * Survives page reload, allowing downloads to resume
 * after browser refresh or disconnect.
 */

const DB_NAME = "ewyoutube-bridge";
const DB_VERSION = 1;
const STORE_NAME = "downloads";

export interface ResumeState {
  downloadId: string;
  videoId: string;
  optionId: string;
  fileName: string;
  sessionId: string;
  videoOffset: number;
  audioOffset: number;
  totalVideoSize: number;
  totalAudioSize: number;
  outputChunks: { offset: number; data: Uint8Array }[];
  outputSize: number;
  createdAt: number;
  updatedAt: number;
}

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
async function getDb(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "downloadId",
        });
        store.createIndex("videoId", "videoId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

/**
 * Save resume state
 */
export async function saveResumeState(state: ResumeState): Promise<void> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    state.updatedAt = Date.now();

    const request = store.put(state);

    request.onerror = () => {
      reject(new Error("Failed to save resume state"));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Get resume state by download ID
 */
export async function getResumeState(
  downloadId: string
): Promise<ResumeState | null> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(downloadId);

    request.onerror = () => {
      reject(new Error("Failed to get resume state"));
    };

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
  });
}

/**
 * Get all resume states for a video
 */
export async function getResumeStatesForVideo(
  videoId: string
): Promise<ResumeState[]> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("videoId");
    const request = index.getAll(videoId);

    request.onerror = () => {
      reject(new Error("Failed to get resume states"));
    };

    request.onsuccess = () => {
      resolve(request.result ?? []);
    };
  });
}

/**
 * Delete resume state
 */
export async function deleteResumeState(downloadId: string): Promise<void> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(downloadId);

    request.onerror = () => {
      reject(new Error("Failed to delete resume state"));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Update offsets for a download
 */
export async function updateOffsets(
  downloadId: string,
  videoOffset: number,
  audioOffset: number
): Promise<void> {
  const state = await getResumeState(downloadId);
  if (!state) return;

  state.videoOffset = videoOffset;
  state.audioOffset = audioOffset;
  state.updatedAt = Date.now();

  await saveResumeState(state);
}

/**
 * Append output chunk
 */
export async function appendOutputChunk(
  downloadId: string,
  offset: number,
  data: Uint8Array
): Promise<void> {
  const state = await getResumeState(downloadId);
  if (!state) return;

  state.outputChunks.push({ offset, data });
  state.outputSize += data.length;
  state.updatedAt = Date.now();

  await saveResumeState(state);
}

/**
 * Clean up old resume states
 */
export async function cleanupOldStates(maxAgeMs: number): Promise<number> {
  const database = await getDb();
  const cutoff = Date.now() - maxAgeMs;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("createdAt");
    const range = IDBKeyRange.upperBound(cutoff);
    const request = index.openCursor(range);

    let deletedCount = 0;

    request.onerror = () => {
      reject(new Error("Failed to cleanup old states"));
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };
  });
}

/**
 * Get all pending resume states
 */
export async function getAllPendingStates(): Promise<ResumeState[]> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error("Failed to get pending states"));
    };

    request.onsuccess = () => {
      resolve(request.result ?? []);
    };
  });
}

/**
 * Create initial resume state
 */
export function createResumeState(
  downloadId: string,
  videoId: string,
  optionId: string,
  fileName: string,
  sessionId: string,
  totalVideoSize: number,
  totalAudioSize: number
): ResumeState {
  const now = Date.now();

  return {
    downloadId,
    videoId,
    optionId,
    fileName,
    sessionId,
    videoOffset: 0,
    audioOffset: 0,
    totalVideoSize,
    totalAudioSize,
    outputChunks: [],
    outputSize: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Assemble output from chunks
 */
export function assembleOutput(state: ResumeState): Uint8Array {
  // Sort chunks by offset
  const sorted = [...state.outputChunks].sort((a, b) => a.offset - b.offset);

  // Calculate total size
  const totalSize = sorted.reduce((sum, c) => sum + c.data.length, 0);

  // Assemble
  const output = new Uint8Array(totalSize);
  for (const chunk of sorted) {
    output.set(chunk.data, chunk.offset);
  }

  return output;
}
