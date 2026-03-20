/**
 * Client-side security validation for WebSocket bridge fetch commands.
 *
 * Before executing any fetch, the client validates:
 * 1. Domain is in allowlist
 * 2. HMAC signature is valid
 * 3. Timestamp is fresh (< 60 seconds)
 * 4. Nonce has not been used before
 */

import type { FetchCommand } from "./protocol";
import {
  WS_BRIDGE_ALLOWED_DOMAINS,
  WS_COMMAND_MAX_AGE_MS,
  WS_MAX_CONCURRENT_FETCHES,
  WS_MAX_BYTES_PER_SESSION,
} from "@/lib/constants";

// Track used nonces to prevent replay attacks
const usedNonces = new Set<string>();
const NONCE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Clean up old nonces periodically
if (typeof window !== "undefined") {
  setInterval(() => {
    usedNonces.clear();
  }, NONCE_CLEANUP_INTERVAL);
}

export interface ValidationContext {
  hmacKey: Uint8Array;
  activeFetchCount: number;
  sessionBytesReceived: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a fetch command before execution
 */
export async function validateFetchCommand(
  cmd: FetchCommand,
  ctx: ValidationContext
): Promise<ValidationResult> {
  // 1. Check domain allowlist
  const domainResult = validateDomain(cmd.url);
  if (!domainResult.valid) return domainResult;

  // 2. Check timestamp freshness
  const timestampResult = validateTimestamp(cmd.timestamp);
  if (!timestampResult.valid) return timestampResult;

  // 3. Check nonce uniqueness
  const nonceResult = validateNonce(cmd.nonce);
  if (!nonceResult.valid) return nonceResult;

  // 4. Verify HMAC signature
  const signatureResult = await verifySignature(cmd, ctx.hmacKey);
  if (!signatureResult.valid) return signatureResult;

  // 5. Check limits
  if (ctx.activeFetchCount >= WS_MAX_CONCURRENT_FETCHES) {
    return { valid: false, error: "Too many concurrent fetches" };
  }

  if (ctx.sessionBytesReceived >= WS_MAX_BYTES_PER_SESSION) {
    return { valid: false, error: "Session byte limit exceeded" };
  }

  return { valid: true };
}

/**
 * Validate URL domain against allowlist
 */
export function validateDomain(url: string): ValidationResult {
  let hostname: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
  } catch {
    return { valid: false, error: "Invalid URL" };
  }

  const isAllowed = WS_BRIDGE_ALLOWED_DOMAINS.some((domain) => {
    if (hostname === domain) return true;
    if (hostname.endsWith(`.${domain}`)) return true;
    return false;
  });

  if (!isAllowed) {
    return { valid: false, error: `Domain not allowed: ${hostname}` };
  }

  return { valid: true };
}

/**
 * Validate timestamp freshness
 */
function validateTimestamp(timestamp: number): ValidationResult {
  const now = Date.now();
  const age = now - timestamp;

  if (age < 0) {
    return { valid: false, error: "Command timestamp is in the future" };
  }

  if (age > WS_COMMAND_MAX_AGE_MS) {
    return { valid: false, error: "Command has expired" };
  }

  return { valid: true };
}

/**
 * Validate nonce uniqueness (replay protection)
 */
function validateNonce(nonce: Uint8Array): ValidationResult {
  const nonceHex = arrayToHex(nonce);

  if (usedNonces.has(nonceHex)) {
    return { valid: false, error: "Nonce already used (replay attack)" };
  }

  usedNonces.add(nonceHex);
  return { valid: true };
}

/**
 * Verify HMAC-SHA256 signature of the fetch command
 */
async function verifySignature(
  cmd: FetchCommand,
  hmacKey: Uint8Array
): Promise<ValidationResult> {
  // Build the signed data: fetchId + timestamp + nonce + url + rangeStart + rangeEnd
  const urlBytes = new TextEncoder().encode(cmd.url);
  const signedData = new Uint8Array(4 + 8 + 16 + urlBytes.length + 8 + 8);
  const view = new DataView(signedData.buffer);
  let offset = 0;

  view.setUint32(offset, cmd.fetchId);
  offset += 4;

  view.setBigUint64(offset, BigInt(cmd.timestamp));
  offset += 8;

  signedData.set(cmd.nonce, offset);
  offset += 16;

  signedData.set(urlBytes, offset);
  offset += urlBytes.length;

  view.setBigUint64(offset, BigInt(cmd.rangeStart));
  offset += 8;

  view.setBigUint64(offset, BigInt(cmd.rangeEnd));

  // Compute HMAC-SHA256
  const keyBuffer = hmacKey.buffer.slice(
    hmacKey.byteOffset,
    hmacKey.byteOffset + hmacKey.byteLength
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const dataBuffer = signedData.buffer.slice(
    signedData.byteOffset,
    signedData.byteOffset + signedData.byteLength
  ) as ArrayBuffer;
  const computedSig = await crypto.subtle.sign("HMAC", key, dataBuffer);
  const computedSigArray = new Uint8Array(computedSig);

  // Constant-time comparison
  if (!constantTimeEquals(computedSigArray, cmd.signature)) {
    return { valid: false, error: "Invalid signature" };
  }

  return { valid: true };
}

/**
 * Constant-time comparison to prevent timing attacks
 */
function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Convert Uint8Array to hex string
 */
function arrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute SHA-256 hash of data (for checksums)
 */
export async function computeSha256(data: Uint8Array): Promise<Uint8Array> {
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return new Uint8Array(hash);
}
