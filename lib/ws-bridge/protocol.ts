/**
 * WebSocket Bridge Binary Protocol
 *
 * All messages use TLV framing: [Type: 1B][Length: 4B BE][Payload: N bytes]
 */

// Server → Client message types
export const MSG_SESSION_INIT = 0x01;
export const MSG_FETCH_CMD = 0x02;
export const MSG_CANCEL_CMD = 0x03;
export const MSG_MUX_PROGRESS = 0x04;
export const MSG_OUTPUT_CHUNK = 0x05;
export const MSG_OUTPUT_DONE = 0x06;
export const MSG_ERROR = 0x07;

// Client → Server message types
export const MSG_START_DOWNLOAD = 0x11;
export const MSG_FETCH_DATA = 0x12;
export const MSG_FETCH_DONE = 0x13;
export const MSG_FETCH_ERROR = 0x14;
export const MSG_RESUME_REQ = 0x15;

// Error codes
export const ERR_INVALID_SESSION = 0x01;
export const ERR_SESSION_EXPIRED = 0x02;
export const ERR_RATE_LIMITED = 0x03;
export const ERR_INVALID_VIDEO = 0x04;
export const ERR_FETCH_FAILED = 0x05;
export const ERR_MUX_FAILED = 0x06;
export const ERR_INTERNAL = 0xff;

export interface SessionInit {
  sessionId: string;
  hmacKey: Uint8Array; // 32 bytes
}

export interface FetchCommand {
  fetchId: number;
  timestamp: number;
  nonce: Uint8Array; // 16 bytes
  signature: Uint8Array; // 32 bytes
  url: string;
  rangeStart: number;
  rangeEnd: number;
}

export interface StartDownload {
  videoId: string;
  optionId: string;
}

export interface FetchData {
  fetchId: number;
  offset: number;
  data: Uint8Array;
}

export interface FetchDone {
  fetchId: number;
  checksum: Uint8Array; // 32 bytes (SHA-256)
  totalSize: number;
}

export interface FetchError {
  fetchId: number;
  errorCode: number;
  message: string;
}

export interface ResumeRequest {
  downloadId: string;
  videoOffset: number;
  audioOffset: number;
}

export interface MuxProgress {
  progress: number; // 0-100
}

export interface OutputChunk {
  offset: number;
  data: Uint8Array;
}

export interface OutputDone {
  checksum: Uint8Array; // 32 bytes
  totalSize: number;
  fileName: string;
}

export interface ErrorMessage {
  code: number;
  message: string;
}

/**
 * Encode a message with TLV framing
 */
export function encodeMessage(type: number, payload: Uint8Array): Uint8Array {
  const length = payload.length;
  const message = new Uint8Array(1 + 4 + length);
  message[0] = type;
  // Big-endian length
  message[1] = (length >>> 24) & 0xff;
  message[2] = (length >>> 16) & 0xff;
  message[3] = (length >>> 8) & 0xff;
  message[4] = length & 0xff;
  message.set(payload, 5);
  return message;
}

/**
 * Decode TLV framed message header
 * Returns { type, length, headerSize } or null if incomplete
 */
export function decodeHeader(
  data: Uint8Array
): { type: number; length: number; headerSize: number } | null {
  if (data.length < 5) return null;
  const type = data[0];
  const length =
    (data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4];
  return { type, length, headerSize: 5 };
}

// Encoding helpers

export function encodeSessionInit(session: SessionInit): Uint8Array {
  const sessionIdBytes = new TextEncoder().encode(session.sessionId);
  const payload = new Uint8Array(2 + sessionIdBytes.length + 32);
  // Session ID length (2 bytes) + session ID + HMAC key (32 bytes)
  payload[0] = (sessionIdBytes.length >>> 8) & 0xff;
  payload[1] = sessionIdBytes.length & 0xff;
  payload.set(sessionIdBytes, 2);
  payload.set(session.hmacKey, 2 + sessionIdBytes.length);
  return encodeMessage(MSG_SESSION_INIT, payload);
}

export function encodeFetchCommand(cmd: FetchCommand): Uint8Array {
  const urlBytes = new TextEncoder().encode(cmd.url);
  // fetchId: 4B, timestamp: 8B, nonce: 16B, signature: 32B, urlLen: 2B, url: N, rangeStart: 8B, rangeEnd: 8B
  const payload = new Uint8Array(4 + 8 + 16 + 32 + 2 + urlBytes.length + 8 + 8);
  const view = new DataView(payload.buffer);
  let offset = 0;

  view.setUint32(offset, cmd.fetchId);
  offset += 4;

  // Timestamp as BigInt (8 bytes)
  view.setBigUint64(offset, BigInt(cmd.timestamp));
  offset += 8;

  payload.set(cmd.nonce, offset);
  offset += 16;

  payload.set(cmd.signature, offset);
  offset += 32;

  view.setUint16(offset, urlBytes.length);
  offset += 2;

  payload.set(urlBytes, offset);
  offset += urlBytes.length;

  view.setBigUint64(offset, BigInt(cmd.rangeStart));
  offset += 8;

  view.setBigUint64(offset, BigInt(cmd.rangeEnd));

  return encodeMessage(MSG_FETCH_CMD, payload);
}

export function encodeCancelCommand(fetchId: number): Uint8Array {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setUint32(0, fetchId);
  return encodeMessage(MSG_CANCEL_CMD, payload);
}

export function encodeMuxProgress(progress: number): Uint8Array {
  const payload = new Uint8Array(1);
  payload[0] = Math.min(100, Math.max(0, Math.round(progress)));
  return encodeMessage(MSG_MUX_PROGRESS, payload);
}

export function encodeOutputChunk(chunk: OutputChunk): Uint8Array {
  const payload = new Uint8Array(8 + chunk.data.length);
  new DataView(payload.buffer).setBigUint64(0, BigInt(chunk.offset));
  payload.set(chunk.data, 8);
  return encodeMessage(MSG_OUTPUT_CHUNK, payload);
}

export function encodeOutputDone(done: OutputDone): Uint8Array {
  const fileNameBytes = new TextEncoder().encode(done.fileName);
  // checksum: 32B, totalSize: 8B, fileNameLen: 2B, fileName: N
  const payload = new Uint8Array(32 + 8 + 2 + fileNameBytes.length);
  const view = new DataView(payload.buffer);

  payload.set(done.checksum, 0);
  view.setBigUint64(32, BigInt(done.totalSize));
  view.setUint16(40, fileNameBytes.length);
  payload.set(fileNameBytes, 42);

  return encodeMessage(MSG_OUTPUT_DONE, payload);
}

export function encodeError(error: ErrorMessage): Uint8Array {
  const messageBytes = new TextEncoder().encode(error.message);
  const payload = new Uint8Array(1 + 2 + messageBytes.length);
  payload[0] = error.code;
  payload[1] = (messageBytes.length >>> 8) & 0xff;
  payload[2] = messageBytes.length & 0xff;
  payload.set(messageBytes, 3);
  return encodeMessage(MSG_ERROR, payload);
}

export function encodeStartDownload(req: StartDownload): Uint8Array {
  const videoIdBytes = new TextEncoder().encode(req.videoId);
  const optionIdBytes = new TextEncoder().encode(req.optionId);
  const payload = new Uint8Array(
    2 + videoIdBytes.length + 2 + optionIdBytes.length
  );
  const view = new DataView(payload.buffer);
  let offset = 0;

  view.setUint16(offset, videoIdBytes.length);
  offset += 2;
  payload.set(videoIdBytes, offset);
  offset += videoIdBytes.length;

  view.setUint16(offset, optionIdBytes.length);
  offset += 2;
  payload.set(optionIdBytes, offset);

  return encodeMessage(MSG_START_DOWNLOAD, payload);
}

export function encodeFetchData(data: FetchData): Uint8Array {
  // fetchId: 4B, offset: 8B, data: N
  const payload = new Uint8Array(4 + 8 + data.data.length);
  const view = new DataView(payload.buffer);

  view.setUint32(0, data.fetchId);
  view.setBigUint64(4, BigInt(data.offset));
  payload.set(data.data, 12);

  return encodeMessage(MSG_FETCH_DATA, payload);
}

export function encodeFetchDone(done: FetchDone): Uint8Array {
  // fetchId: 4B, checksum: 32B, totalSize: 8B
  const payload = new Uint8Array(4 + 32 + 8);
  const view = new DataView(payload.buffer);

  view.setUint32(0, done.fetchId);
  payload.set(done.checksum, 4);
  view.setBigUint64(36, BigInt(done.totalSize));

  return encodeMessage(MSG_FETCH_DONE, payload);
}

export function encodeFetchError(error: FetchError): Uint8Array {
  const messageBytes = new TextEncoder().encode(error.message);
  // fetchId: 4B, errorCode: 1B, messageLen: 2B, message: N
  const payload = new Uint8Array(4 + 1 + 2 + messageBytes.length);
  const view = new DataView(payload.buffer);

  view.setUint32(0, error.fetchId);
  payload[4] = error.errorCode;
  view.setUint16(5, messageBytes.length);
  payload.set(messageBytes, 7);

  return encodeMessage(MSG_FETCH_ERROR, payload);
}

export function encodeResumeRequest(req: ResumeRequest): Uint8Array {
  const downloadIdBytes = new TextEncoder().encode(req.downloadId);
  // downloadIdLen: 2B, downloadId: N, videoOffset: 8B, audioOffset: 8B
  const payload = new Uint8Array(2 + downloadIdBytes.length + 8 + 8);
  const view = new DataView(payload.buffer);
  let offset = 0;

  view.setUint16(offset, downloadIdBytes.length);
  offset += 2;
  payload.set(downloadIdBytes, offset);
  offset += downloadIdBytes.length;

  view.setBigUint64(offset, BigInt(req.videoOffset));
  offset += 8;
  view.setBigUint64(offset, BigInt(req.audioOffset));

  return encodeMessage(MSG_RESUME_REQ, payload);
}

// Decoding helpers

export function decodeSessionInit(payload: Uint8Array): SessionInit {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );
  const sessionIdLen = view.getUint16(0);
  const sessionId = new TextDecoder().decode(payload.slice(2, 2 + sessionIdLen));
  const hmacKey = payload.slice(2 + sessionIdLen, 2 + sessionIdLen + 32);
  return { sessionId, hmacKey };
}

export function decodeFetchCommand(payload: Uint8Array): FetchCommand {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );
  let offset = 0;

  const fetchId = view.getUint32(offset);
  offset += 4;

  const timestamp = Number(view.getBigUint64(offset));
  offset += 8;

  const nonce = payload.slice(offset, offset + 16);
  offset += 16;

  const signature = payload.slice(offset, offset + 32);
  offset += 32;

  const urlLen = view.getUint16(offset);
  offset += 2;

  const url = new TextDecoder().decode(payload.slice(offset, offset + urlLen));
  offset += urlLen;

  const rangeStart = Number(view.getBigUint64(offset));
  offset += 8;

  const rangeEnd = Number(view.getBigUint64(offset));

  return { fetchId, timestamp, nonce, signature, url, rangeStart, rangeEnd };
}

export function decodeStartDownload(payload: Uint8Array): StartDownload {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );
  let offset = 0;

  const videoIdLen = view.getUint16(offset);
  offset += 2;

  const videoId = new TextDecoder().decode(
    payload.slice(offset, offset + videoIdLen)
  );
  offset += videoIdLen;

  const optionIdLen = view.getUint16(offset);
  offset += 2;

  const optionId = new TextDecoder().decode(
    payload.slice(offset, offset + optionIdLen)
  );

  return { videoId, optionId };
}

export function decodeFetchData(payload: Uint8Array): FetchData {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );

  const fetchId = view.getUint32(0);
  const offset = Number(view.getBigUint64(4));
  const data = payload.slice(12);

  return { fetchId, offset, data };
}

export function decodeFetchDone(payload: Uint8Array): FetchDone {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );

  const fetchId = view.getUint32(0);
  const checksum = payload.slice(4, 36);
  const totalSize = Number(view.getBigUint64(36));

  return { fetchId, checksum, totalSize };
}

export function decodeFetchError(payload: Uint8Array): FetchError {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );

  const fetchId = view.getUint32(0);
  const errorCode = payload[4];
  const messageLen = view.getUint16(5);
  const message = new TextDecoder().decode(payload.slice(7, 7 + messageLen));

  return { fetchId, errorCode, message };
}

export function decodeResumeRequest(payload: Uint8Array): ResumeRequest {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );
  let offset = 0;

  const downloadIdLen = view.getUint16(offset);
  offset += 2;

  const downloadId = new TextDecoder().decode(
    payload.slice(offset, offset + downloadIdLen)
  );
  offset += downloadIdLen;

  const videoOffset = Number(view.getBigUint64(offset));
  offset += 8;

  const audioOffset = Number(view.getBigUint64(offset));

  return { downloadId, videoOffset, audioOffset };
}

export function decodeMuxProgress(payload: Uint8Array): MuxProgress {
  return { progress: payload[0] };
}

export function decodeOutputChunk(payload: Uint8Array): OutputChunk {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );
  const offset = Number(view.getBigUint64(0));
  const data = payload.slice(8);
  return { offset, data };
}

export function decodeOutputDone(payload: Uint8Array): OutputDone {
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  );

  const checksum = payload.slice(0, 32);
  const totalSize = Number(view.getBigUint64(32));
  const fileNameLen = view.getUint16(40);
  const fileName = new TextDecoder().decode(payload.slice(42, 42 + fileNameLen));

  return { checksum, totalSize, fileName };
}

export function decodeError(payload: Uint8Array): ErrorMessage {
  const code = payload[0];
  const messageLen = (payload[1] << 8) | payload[2];
  const message = new TextDecoder().decode(payload.slice(3, 3 + messageLen));
  return { code, message };
}
