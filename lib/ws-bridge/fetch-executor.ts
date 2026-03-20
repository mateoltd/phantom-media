/**
 * Fetch executor for WebSocket bridge.
 *
 * Executes validated fetch commands using the browser's fetch API,
 * streaming chunks back to the server via WebSocket.
 */

import {
  validateFetchCommand,
  computeSha256,
  type ValidationContext,
} from "./client-security";
import {
  encodeFetchData,
  encodeFetchDone,
  encodeFetchError,
  ERR_FETCH_FAILED,
  type FetchCommand,
} from "./protocol";
import type { BridgeClient } from "./client";
import { WS_CHUNK_SIZE } from "@/lib/constants";

interface ActiveFetch {
  fetchId: number;
  controller: AbortController;
  bytesReceived: number;
}

export class FetchExecutor {
  private client: BridgeClient;
  private hmacKey: Uint8Array | null = null;
  private activeFetches = new Map<number, ActiveFetch>();
  private sessionBytesReceived = 0;

  constructor(client: BridgeClient) {
    this.client = client;
  }

  /**
   * Set the session HMAC key
   */
  setHmacKey(key: Uint8Array): void {
    this.hmacKey = key;
  }

  /**
   * Execute a fetch command
   */
  async executeFetch(cmd: FetchCommand): Promise<void> {
    if (!this.hmacKey) {
      this.sendError(cmd.fetchId, "No HMAC key set");
      return;
    }

    // Build validation context
    const ctx: ValidationContext = {
      hmacKey: this.hmacKey,
      activeFetchCount: this.activeFetches.size,
      sessionBytesReceived: this.sessionBytesReceived,
    };

    // Validate command
    const validation = await validateFetchCommand(cmd, ctx);
    if (!validation.valid) {
      this.sendError(cmd.fetchId, validation.error ?? "Validation failed");
      return;
    }

    // Create abort controller
    const controller = new AbortController();
    this.activeFetches.set(cmd.fetchId, {
      fetchId: cmd.fetchId,
      controller,
      bytesReceived: 0,
    });

    try {
      await this.doFetch(cmd, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.sendError(
          cmd.fetchId,
          error instanceof Error ? error.message : "Fetch failed"
        );
      }
    } finally {
      this.activeFetches.delete(cmd.fetchId);
    }
  }

  /**
   * Cancel a fetch
   */
  cancelFetch(fetchId: number): void {
    const fetch = this.activeFetches.get(fetchId);
    if (fetch) {
      fetch.controller.abort();
      this.activeFetches.delete(fetchId);
    }
  }

  /**
   * Cancel all fetches
   */
  cancelAllFetches(): void {
    for (const fetch of this.activeFetches.values()) {
      fetch.controller.abort();
    }
    this.activeFetches.clear();
  }

  /**
   * Get active fetch count
   */
  getActiveFetchCount(): number {
    return this.activeFetches.size;
  }

  private async doFetch(cmd: FetchCommand, signal: AbortSignal): Promise<void> {
    // Build request headers
    const headers: HeadersInit = {};
    if (cmd.rangeStart > 0 || cmd.rangeEnd > 0) {
      headers["Range"] = `bytes=${cmd.rangeStart}-${cmd.rangeEnd || ""}`;
    }

    // Execute fetch
    const response = await fetch(cmd.url, {
      method: "GET",
      headers,
      signal,
      credentials: "omit",
      mode: "cors",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    // Stream response chunks
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let offset = 0;
    let pendingData = new Uint8Array(0);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Collect for checksum
      chunks.push(value);

      // Combine with pending data
      const combined = new Uint8Array(pendingData.length + value.length);
      combined.set(pendingData);
      combined.set(value, pendingData.length);

      // Send complete chunks
      let pos = 0;
      while (pos + WS_CHUNK_SIZE <= combined.length) {
        const chunk = combined.slice(pos, pos + WS_CHUNK_SIZE);
        this.sendData(cmd.fetchId, offset, chunk);
        offset += chunk.length;
        pos += WS_CHUNK_SIZE;
      }

      // Save remainder for next iteration
      pendingData = combined.slice(pos);

      // Update tracking
      const activeFetch = this.activeFetches.get(cmd.fetchId);
      if (activeFetch) {
        activeFetch.bytesReceived = offset + pendingData.length;
      }
      this.sessionBytesReceived += value.length;
    }

    // Send any remaining data
    if (pendingData.length > 0) {
      this.sendData(cmd.fetchId, offset, pendingData);
      offset += pendingData.length;
    }

    // Compute checksum
    const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
    const allData = new Uint8Array(totalSize);
    let pos = 0;
    for (const chunk of chunks) {
      allData.set(chunk, pos);
      pos += chunk.length;
    }
    const checksum = await computeSha256(allData);

    // Send completion
    this.sendDone(cmd.fetchId, checksum, totalSize);
  }

  private sendData(fetchId: number, offset: number, data: Uint8Array): void {
    const message = encodeFetchData({ fetchId, offset, data });
    this.client.send(message);
  }

  private sendDone(
    fetchId: number,
    checksum: Uint8Array,
    totalSize: number
  ): void {
    const message = encodeFetchDone({ fetchId, checksum, totalSize });
    this.client.send(message);
  }

  private sendError(fetchId: number, message: string): void {
    const msg = encodeFetchError({
      fetchId,
      errorCode: ERR_FETCH_FAILED,
      message,
    });
    this.client.send(msg);
  }
}
