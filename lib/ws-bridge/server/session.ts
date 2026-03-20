/**
 * Server-side session management for WebSocket bridge.
 *
 * Each session has:
 * - Unique ID
 * - HMAC key for signing commands
 * - Per-IP rate limiting
 * - Expiration time
 */

import { randomBytes, createHmac } from "crypto";
import {
  WS_SESSION_TTL_MS,
  WS_MAX_SESSIONS_PER_IP,
  WS_MAX_BYTES_PER_SESSION,
} from "@/lib/constants";

export interface BridgeSession {
  id: string;
  hmacKey: Buffer;
  clientIp: string;
  createdAt: number;
  expiresAt: number;
  bytesReceived: number;
  downloadId?: string;
  videoTempPath?: string;
  audioTempPath?: string;
  activeFetches: Map<number, FetchState>;
  nextFetchId: number;
}

export interface FetchState {
  url: string;
  rangeStart: number;
  rangeEnd: number;
  bytesReceived: number;
  expectedSize: number;
  isVideo: boolean;
}

// Active sessions by ID
const sessions = new Map<string, BridgeSession>();

// Sessions per IP for rate limiting
const sessionsByIp = new Map<string, Set<string>>();

// Cleanup interval
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL);
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt < now) {
      removeSession(sessionId);
    }
  }
}

/**
 * Create a new session for a client
 */
export function createSession(clientIp: string): BridgeSession | null {
  // Check per-IP limit
  const ipSessions = sessionsByIp.get(clientIp) ?? new Set();
  if (ipSessions.size >= WS_MAX_SESSIONS_PER_IP) {
    return null;
  }

  // Generate session ID and HMAC key
  const id = randomBytes(16).toString("hex");
  const hmacKey = randomBytes(32);
  const now = Date.now();

  const session: BridgeSession = {
    id,
    hmacKey,
    clientIp,
    createdAt: now,
    expiresAt: now + WS_SESSION_TTL_MS,
    bytesReceived: 0,
    activeFetches: new Map(),
    nextFetchId: 1,
  };

  sessions.set(id, session);

  // Track per-IP
  ipSessions.add(id);
  sessionsByIp.set(clientIp, ipSessions);

  startCleanupTimer();

  return session;
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): BridgeSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Check expiration
  if (session.expiresAt < Date.now()) {
    removeSession(sessionId);
    return null;
  }

  return session;
}

/**
 * Remove a session
 */
export function removeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  sessions.delete(sessionId);

  // Remove from per-IP tracking
  const ipSessions = sessionsByIp.get(session.clientIp);
  if (ipSessions) {
    ipSessions.delete(sessionId);
    if (ipSessions.size === 0) {
      sessionsByIp.delete(session.clientIp);
    }
  }
}

/**
 * Extend session expiration
 */
export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.expiresAt = Date.now() + WS_SESSION_TTL_MS;
  }
}

/**
 * Add bytes to session total
 */
export function addSessionBytes(
  sessionId: string,
  bytes: number
): { ok: boolean; totalBytes: number } {
  const session = sessions.get(sessionId);
  if (!session) {
    return { ok: false, totalBytes: 0 };
  }

  session.bytesReceived += bytes;

  if (session.bytesReceived > WS_MAX_BYTES_PER_SESSION) {
    return { ok: false, totalBytes: session.bytesReceived };
  }

  return { ok: true, totalBytes: session.bytesReceived };
}

/**
 * Create a signed fetch command
 */
export function signFetchCommand(
  session: BridgeSession,
  url: string,
  rangeStart: number,
  rangeEnd: number,
  isVideo: boolean
): {
  fetchId: number;
  timestamp: number;
  nonce: Buffer;
  signature: Buffer;
} {
  const fetchId = session.nextFetchId++;
  const timestamp = Date.now();
  const nonce = randomBytes(16);

  // Build data to sign: fetchId + timestamp + nonce + url + rangeStart + rangeEnd
  const urlBytes = Buffer.from(url, "utf8");
  const signedData = Buffer.alloc(4 + 8 + 16 + urlBytes.length + 8 + 8);
  let offset = 0;

  signedData.writeUInt32BE(fetchId, offset);
  offset += 4;

  signedData.writeBigUInt64BE(BigInt(timestamp), offset);
  offset += 8;

  nonce.copy(signedData, offset);
  offset += 16;

  urlBytes.copy(signedData, offset);
  offset += urlBytes.length;

  signedData.writeBigUInt64BE(BigInt(rangeStart), offset);
  offset += 8;

  signedData.writeBigUInt64BE(BigInt(rangeEnd), offset);

  // Compute HMAC-SHA256
  const hmac = createHmac("sha256", session.hmacKey);
  hmac.update(signedData);
  const signature = hmac.digest();

  // Track active fetch
  const expectedSize = rangeEnd > 0 ? rangeEnd - rangeStart + 1 : 0;
  session.activeFetches.set(fetchId, {
    url,
    rangeStart,
    rangeEnd,
    bytesReceived: 0,
    expectedSize,
    isVideo,
  });

  return { fetchId, timestamp, nonce, signature };
}

/**
 * Update fetch progress
 */
export function updateFetchProgress(
  sessionId: string,
  fetchId: number,
  bytesReceived: number
): FetchState | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const fetch = session.activeFetches.get(fetchId);
  if (!fetch) return null;

  fetch.bytesReceived = bytesReceived;
  return fetch;
}

/**
 * Complete a fetch
 */
export function completeFetch(sessionId: string, fetchId: number): FetchState | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const fetch = session.activeFetches.get(fetchId);
  session.activeFetches.delete(fetchId);
  return fetch ?? null;
}

/**
 * Get session stats for debugging
 */
export function getSessionStats(): {
  totalSessions: number;
  sessionsByIp: Record<string, number>;
} {
  const ipCounts: Record<string, number> = {};
  for (const [ip, sessionIds] of sessionsByIp) {
    ipCounts[ip] = sessionIds.size;
  }

  return {
    totalSessions: sessions.size,
    sessionsByIp: ipCounts,
  };
}
