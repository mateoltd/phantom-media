import type { StreamCandidate } from "../../lib/types";

export declare const WRAPPER_MEDIA_PROXY_PATH: string;

export declare function assertWrapperMediaUrl(
  input: string | URL,
): URL;

export declare function encodeWrapperMediaTarget(
  upstream: string | URL,
  proxyOrigin: string | URL,
): string;

export declare function decodeWrapperMediaTarget(encoded: unknown): URL;

export declare function proxyWrapperCandidate(
  candidate: StreamCandidate,
  proxyOrigin: string | URL,
): StreamCandidate;

export declare function primeWrapperMediaTarget(
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
): string;

export declare function proxyWrapperMediaRequest(
  request: Request,
  options?: { fetchImpl?: typeof fetch },
): Promise<Response>;
