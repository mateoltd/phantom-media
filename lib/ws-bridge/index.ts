/**
 * WebSocket Bridge module exports.
 *
 * Client-side usage:
 *   import { BridgeDownload } from '@/lib/ws-bridge';
 *
 * Server-side usage:
 *   import { handleWebSocket } from '@/lib/ws-bridge/server/handler';
 */

// Client exports
export { BridgeClient, type ConnectionState, type BridgeClientCallbacks } from "./client";
export { FetchExecutor } from "./fetch-executor";
export { BridgeDownload, triggerDownload, type BridgeDownloadCallbacks } from "./bridge-download";

// Protocol exports (used by both client and server)
export * from "./protocol";

// Client security exports
export { validateFetchCommand, validateDomain, computeSha256 } from "./client-security";

// Resume store exports
export {
  saveResumeState,
  getResumeState,
  deleteResumeState,
  createResumeState,
  getAllPendingStates,
  cleanupOldStates,
  type ResumeState,
} from "./resume-store";
