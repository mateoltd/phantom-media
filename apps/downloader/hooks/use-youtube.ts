"use client";

import { useState, useCallback } from "react";
import type {
  QueryResult,
  DownloadOption,
  ResolveResponse,
  StreamsResponse,
  SearchResponse,
} from "@/lib/types";

const STREAM_CACHE_TTL_MS = 5 * 60 * 1000;
const STREAM_CACHE_MAX_ENTRIES = 50;
const streamRequestCache = new Map<
  string,
  { options: DownloadOption[]; expiresAt: number }
>();
const streamRequestsInFlight = new Map<
  string,
  Promise<DownloadOption[]>
>();

export async function fetchStreamOptions(
  videoId: string
): Promise<DownloadOption[]> {
  const cached = streamRequestCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    streamRequestCache.delete(videoId);
    streamRequestCache.set(videoId, cached);
    return cached.options;
  }
  if (cached) streamRequestCache.delete(videoId);

  const existing = streamRequestsInFlight.get(videoId);
  if (existing) return existing;

  const request = fetch("/api/streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId }),
  }).then(async (response) => {
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? `Request failed: ${response.status}`);
    }
    const data = (await response.json()) as StreamsResponse;
    return data.options;
  });

  streamRequestsInFlight.set(videoId, request);
  try {
    const options = await request;
    streamRequestCache.set(videoId, {
      options,
      expiresAt: Date.now() + STREAM_CACHE_TTL_MS,
    });
    while (streamRequestCache.size > STREAM_CACHE_MAX_ENTRIES) {
      const oldestKey = streamRequestCache.keys().next().value;
      if (!oldestKey) break;
      streamRequestCache.delete(oldestKey);
    }
    return options;
  } finally {
    streamRequestsInFlight.delete(videoId);
  }
}

export function prefetchStreamOptions(videoId: string): void {
  void fetchStreamOptions(videoId).catch(() => undefined);
}

export function useResolve() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  const resolve = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const data = (await res.json()) as ResolveResponse;
      setResult(data.result);
      return data.result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resolve query";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { resolve, loading, error, result, setResult };
}

export function useStreams() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<DownloadOption[]>([]);

  const fetchStreams = useCallback(async (videoId: string) => {
    setLoading(true);
    setError(null);
    setOptions([]);

    try {
      const nextOptions = await fetchStreamOptions(videoId);
      setOptions(nextOptions);
      return nextOptions;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get streams";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchStreams, loading, error, options };
}

export function useSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      const data = (await res.json()) as SearchResponse;
      setResult(data.result);
      return data.result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Search failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { search, loading, error, result };
}
