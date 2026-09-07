import type { StreamCandidate } from "../../lib/types";

export declare const WRAPPER_MEDIA_PROXY_PATH: string;

export declare class ProxyCapabilityError extends Error {
  status: number;
  retryable: boolean;
  retryAfterMs: number;
  details: { stage: string };
}

export declare function assertDiscoveredVideasyMediaUrl(
  input: string | URL,
): URL;

export declare function assertDiscoveredCineSrcMediaUrl(
  input: string | URL,
): URL;

export declare function assertWrapperMediaUrl(
  input: string | URL,
): URL;

export declare function encodeWrapperMediaTarget(
  upstream: string | URL,
  proxyOrigin: string | URL,
): string;

export declare function encodeDiscoveredVideasyMediaTarget(
  upstream: string | URL,
  proxyOrigin: string | URL,
  options?: {
    secret?: string;
    now?: number;
    ttlMs?: number;
  },
): string;

export declare function encodeDiscoveredCineSrcMediaTarget(
  upstream: string | URL,
  proxyOrigin: string | URL,
  options?: {
    secret?: string;
    now?: number;
    ttlMs?: number;
  },
): string;

export declare function decodeWrapperMediaTarget(encoded: unknown): URL;

export declare function decodeDiscoveredVideasyMediaTarget(
  encoded: unknown,
  expires: unknown,
  signature: unknown,
  options?: { secret?: string; now?: number },
): URL;

export declare function decodeDiscoveredCineSrcMediaTarget(
  encoded: unknown,
  expires: unknown,
  signature: unknown,
  options?: { secret?: string; now?: number },
): URL;

export declare function proxyWrapperCandidate(
  candidate: StreamCandidate,
  proxyOrigin: string | URL,
): StreamCandidate;

export declare function proxyDiscoveredVideasyCandidate(
  candidate: StreamCandidate,
  proxyOrigin: string | URL,
  options?: { secret?: string; now?: number; ttlMs?: number },
): StreamCandidate;

export declare function proxyDiscoveredCineSrcCandidate(
  candidate: StreamCandidate,
  proxyOrigin: string | URL,
  options?: { secret?: string; now?: number; ttlMs?: number },
): StreamCandidate;

export declare function primeWrapperMediaTarget(
  input: string | URL,
  options?: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<string>;

export declare function primeDiscoveredVideasyMediaTarget(
  input: string | URL,
  options?: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<string>;

export declare function primeDiscoveredCineSrcMediaTarget(
  input: string | URL,
  options?: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<string>;

export declare function rewriteWrapperHls(
  manifest: string,
  upstream: string | URL,
  proxyOrigin: string | URL,
  options?: {
    secret?: string;
    now?: number;
    ttlMs?: number;
    source?: "cinesrc" | "videasy";
  },
): string;

export declare function proxyWrapperMediaRequest(
  request: Request,
  options?: {
    fetchImpl?: typeof fetch;
    secret?: string;
    now?: number;
    ttlMs?: number;
  },
): Promise<Response>;
