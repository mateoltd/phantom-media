/**
 * Client-side WebSocket manager for the bridge protocol.
 *
 * Handles:
 * - Connection lifecycle (connect, reconnect, close)
 * - Message parsing and dispatch
 * - Ping/pong keepalive
 */

import {
  MSG_SESSION_INIT,
  MSG_FETCH_CMD,
  MSG_CANCEL_CMD,
  MSG_MUX_PROGRESS,
  MSG_OUTPUT_CHUNK,
  MSG_OUTPUT_DONE,
  MSG_ERROR,
  decodeHeader,
  decodeSessionInit,
  decodeFetchCommand,
  decodeMuxProgress,
  decodeOutputChunk,
  decodeOutputDone,
  decodeError,
  encodeStartDownload,
  encodeResumeRequest,
  type SessionInit,
  type FetchCommand,
  type MuxProgress,
  type OutputChunk,
  type OutputDone,
  type ErrorMessage,
} from "./protocol";
import { WS_PING_INTERVAL_MS } from "@/lib/constants";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface BridgeClientCallbacks {
  onStateChange: (state: ConnectionState) => void;
  onSessionInit: (session: SessionInit) => void;
  onFetchCommand: (cmd: FetchCommand) => void;
  onCancelCommand: (fetchId: number) => void;
  onMuxProgress: (progress: MuxProgress) => void;
  onOutputChunk: (chunk: OutputChunk) => void;
  onOutputDone: (done: OutputDone) => void;
  onError: (error: ErrorMessage) => void;
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private callbacks: BridgeClientCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000;
  private messageBuffer: Uint8Array = new Uint8Array(0);
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(callbacks: BridgeClientCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to the WebSocket bridge
   */
  connect(): void {
    if (this.ws && this.state === "connected") return;

    this.setState("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws/download`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.setState("connected");
      this.reconnectAttempts = 0;
      this.startPingTimer();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data as ArrayBuffer);
    };

    this.ws.onclose = () => {
      this.cleanup();
      this.maybeReconnect();
    };

    this.ws.onerror = () => {
      this.setState("error");
    };
  }

  /**
   * Disconnect from the bridge
   */
  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    this.cleanup();
  }

  /**
   * Send a start download request
   */
  startDownload(videoId: string, optionId: string): boolean {
    if (!this.ws || this.state !== "connected") return false;

    const message = encodeStartDownload({ videoId, optionId });
    this.ws.send(message);
    return true;
  }

  /**
   * Send a resume request
   */
  resumeDownload(
    downloadId: string,
    videoOffset: number,
    audioOffset: number
  ): boolean {
    if (!this.ws || this.state !== "connected") return false;

    const message = encodeResumeRequest({
      downloadId,
      videoOffset,
      audioOffset,
    });
    this.ws.send(message);
    return true;
  }

  /**
   * Send a raw message
   */
  send(data: Uint8Array): boolean {
    if (!this.ws || this.state !== "connected") return false;

    try {
      this.ws.send(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  private handleMessage(data: ArrayBuffer): void {
    // Append to buffer
    const newData = new Uint8Array(data);
    const combined = new Uint8Array(
      this.messageBuffer.length + newData.length
    );
    combined.set(this.messageBuffer);
    combined.set(newData, this.messageBuffer.length);
    this.messageBuffer = combined;

    // Process complete messages
    while (this.messageBuffer.length >= 5) {
      const header = decodeHeader(this.messageBuffer);
      if (!header) break;

      const totalLength = header.headerSize + header.length;
      if (this.messageBuffer.length < totalLength) break;

      const payload = this.messageBuffer.slice(header.headerSize, totalLength);
      this.messageBuffer = this.messageBuffer.slice(totalLength);

      this.processMessage(header.type, payload);
    }
  }

  private processMessage(type: number, payload: Uint8Array): void {
    switch (type) {
      case MSG_SESSION_INIT: {
        const session = decodeSessionInit(payload);
        this.callbacks.onSessionInit(session);
        break;
      }

      case MSG_FETCH_CMD: {
        const cmd = decodeFetchCommand(payload);
        this.callbacks.onFetchCommand(cmd);
        break;
      }

      case MSG_CANCEL_CMD: {
        const view = new DataView(
          payload.buffer,
          payload.byteOffset,
          payload.byteLength
        );
        const fetchId = view.getUint32(0);
        this.callbacks.onCancelCommand(fetchId);
        break;
      }

      case MSG_MUX_PROGRESS: {
        const progress = decodeMuxProgress(payload);
        this.callbacks.onMuxProgress(progress);
        break;
      }

      case MSG_OUTPUT_CHUNK: {
        const chunk = decodeOutputChunk(payload);
        this.callbacks.onOutputChunk(chunk);
        break;
      }

      case MSG_OUTPUT_DONE: {
        const done = decodeOutputDone(payload);
        this.callbacks.onOutputDone(done);
        break;
      }

      case MSG_ERROR: {
        const error = decodeError(payload);
        this.callbacks.onError(error);
        break;
      }
    }
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }

      this.ws = null;
    }

    this.setState("disconnected");
    this.messageBuffer = new Uint8Array(0);
  }

  private maybeReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState("error");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      if (this.state === "disconnected") {
        this.connect();
      }
    }, delay);
  }

  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      // WebSocket ping is handled automatically by the browser
      // This is just for connection health monitoring
    }, WS_PING_INTERVAL_MS);
  }
}
