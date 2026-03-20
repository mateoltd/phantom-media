/**
 * Server-side WebSocket handler for the bridge protocol.
 *
 * Manages:
 * - Connection lifecycle
 * - Message routing
 * - State machine for download lifecycle
 */

import type { WebSocket } from "ws";
import {
  MSG_START_DOWNLOAD,
  MSG_FETCH_DATA,
  MSG_FETCH_DONE,
  MSG_FETCH_ERROR,
  MSG_RESUME_REQ,
  decodeHeader,
  decodeStartDownload,
  decodeFetchData,
  decodeFetchDone,
  decodeFetchError,
  decodeResumeRequest,
  encodeSessionInit,
  encodeError,
  ERR_INVALID_SESSION,
  ERR_RATE_LIMITED,
  ERR_INTERNAL,
} from "../protocol";
import {
  createSession,
  removeSession,
  touchSession,
  addSessionBytes,
  type BridgeSession,
} from "./session";
import { startDownload, handleFetchData, handleFetchDone, handleFetchError, handleResume } from "./orchestrator";
import { WS_PING_INTERVAL_MS } from "@/lib/constants";

interface ConnectionState {
  ws: WebSocket;
  session: BridgeSession | null;
  clientIp: string;
  buffer: Buffer;
  pingTimer: NodeJS.Timeout | null;
  isAlive: boolean;
}

const connections = new Map<WebSocket, ConnectionState>();

/**
 * Handle a new WebSocket connection
 */
export function handleWebSocket(ws: WebSocket, clientIp: string): void {
  const state: ConnectionState = {
    ws,
    session: null,
    clientIp,
    buffer: Buffer.alloc(0),
    pingTimer: null,
    isAlive: true,
  };

  connections.set(ws, state);

  // Create session
  const session = createSession(clientIp);
  if (!session) {
    ws.send(encodeError({ code: ERR_RATE_LIMITED, message: "Too many active sessions" }));
    ws.close();
    return;
  }

  state.session = session;

  // Send session init
  ws.send(
    encodeSessionInit({
      sessionId: session.id,
      hmacKey: session.hmacKey,
    })
  );

  // Set up ping/pong for keepalive
  state.pingTimer = setInterval(() => {
    if (!state.isAlive) {
      cleanup(ws);
      return;
    }
    state.isAlive = false;
    ws.ping();
  }, WS_PING_INTERVAL_MS);

  ws.on("pong", () => {
    state.isAlive = true;
    if (state.session) {
      touchSession(state.session.id);
    }
  });

  ws.on("message", (data: Buffer) => {
    handleMessage(ws, data);
  });

  ws.on("close", () => {
    cleanup(ws);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for ${clientIp}:`, error.message);
    cleanup(ws);
  });
}

/**
 * Handle incoming message
 */
function handleMessage(ws: WebSocket, data: Buffer): void {
  const state = connections.get(ws);
  if (!state || !state.session) {
    ws.send(encodeError({ code: ERR_INVALID_SESSION, message: "No active session" }));
    ws.close();
    return;
  }

  // Append to buffer
  state.buffer = Buffer.concat([state.buffer, data]);

  // Process complete messages
  while (state.buffer.length >= 5) {
    const header = decodeHeader(state.buffer);
    if (!header) break;

    const totalLength = header.headerSize + header.length;
    if (state.buffer.length < totalLength) break;

    const payload = state.buffer.subarray(header.headerSize, totalLength);
    state.buffer = state.buffer.subarray(totalLength);

    processMessage(ws, state, header.type, payload);
  }
}

/**
 * Process a complete message
 */
async function processMessage(
  ws: WebSocket,
  state: ConnectionState,
  type: number,
  payload: Buffer
): Promise<void> {
  if (!state.session) return;

  try {
    switch (type) {
      case MSG_START_DOWNLOAD: {
        const req = decodeStartDownload(payload);
        await startDownload(ws, state.session, req.videoId, req.optionId);
        break;
      }

      case MSG_FETCH_DATA: {
        const data = decodeFetchData(payload);

        // Track bytes for rate limiting
        const result = addSessionBytes(state.session.id, data.data.length);
        if (!result.ok) {
          ws.send(encodeError({ code: ERR_RATE_LIMITED, message: "Session byte limit exceeded" }));
          ws.close();
          return;
        }

        await handleFetchData(ws, state.session, data);
        break;
      }

      case MSG_FETCH_DONE: {
        const done = decodeFetchDone(payload);
        await handleFetchDone(ws, state.session, done);
        break;
      }

      case MSG_FETCH_ERROR: {
        const error = decodeFetchError(payload);
        await handleFetchError(ws, state.session, error);
        break;
      }

      case MSG_RESUME_REQ: {
        const req = decodeResumeRequest(payload);
        await handleResume(ws, state.session, req);
        break;
      }

      default:
        console.warn(`Unknown message type: 0x${type.toString(16)}`);
    }
  } catch (error) {
    console.error("Error processing message:", error);
    ws.send(
      encodeError({
        code: ERR_INTERNAL,
        message: error instanceof Error ? error.message : "Internal error",
      })
    );
  }
}

/**
 * Clean up connection state
 */
function cleanup(ws: WebSocket): void {
  const state = connections.get(ws);
  if (!state) return;

  if (state.pingTimer) {
    clearInterval(state.pingTimer);
  }

  if (state.session) {
    removeSession(state.session.id);
  }

  connections.delete(ws);

  try {
    ws.terminate();
  } catch {
    // Already closed
  }
}

/**
 * Send a message to a client
 */
export function sendMessage(ws: WebSocket, message: Uint8Array): boolean {
  const state = connections.get(ws);
  if (!state) return false;

  try {
    ws.send(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get connection stats
 */
export function getConnectionStats(): {
  totalConnections: number;
  connectionsByIp: Record<string, number>;
} {
  const byIp: Record<string, number> = {};

  for (const state of connections.values()) {
    byIp[state.clientIp] = (byIp[state.clientIp] ?? 0) + 1;
  }

  return {
    totalConnections: connections.size,
    connectionsByIp: byIp,
  };
}
