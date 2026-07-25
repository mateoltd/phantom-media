"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import { AppHeader } from "@/components/app-header";
import { PosterTile } from "@/components/poster-tile";
import { SiteFooter } from "@/components/site-footer";
import { looksLikeIdentifier } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

interface SearchPayload {
  mode?: "text" | "imdb" | "tmdb-id";
  translatedFrom?: string;
  results?: MediaResult[];
  error?: string;
}

export default function SearchPageClient() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q")?.trim() ?? "";
  const [results, setResults] = useState<MediaResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) return;

    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as SearchPayload;
        if (!response.ok) throw new Error(payload.error ?? "Search failed");
        return payload;
      })
      .then((payload) => {
        setResults(payload.results ?? []);
        setError(null);
      })
      .catch((cause: Error) => {
        if (cause.name === "AbortError") return;
        setResults([]);
        setError(cause.message);
      });

    return () => controller.abort();
  }, [query]);

  const loading = results === null && !error;

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader initialQuery={query} />

      <div className="app-shell flex-1 pb-14 pt-2">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase text-phantom">
              Results
            </p>
            <h1 className="mt-1 truncate text-2xl font-extrabold tracking-[-0.02em] text-text">
              {query || "Nothing searched yet"}
            </h1>
          </div>
          {results && results.length > 0 && (
            <p className="shrink-0 font-mono text-[11px] text-text-tertiary">
              {results.length} {results.length === 1 ? "title" : "titles"}
            </p>
          )}
        </div>

        {loading && (
          <div className="flex min-h-60 flex-col items-center justify-center">
            <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-border border-t-phantom" />
            <p className="mt-4 text-[13px] font-bold text-text-secondary">
              Searching the catalog
            </p>
          </div>
        )}

        {error && <EmptyState title="The search failed" body={error} />}

        {!error && results?.length === 0 && (
          <EmptyState
            title="No playable titles matched"
            body={
              looksLikeIdentifier(query)
                ? "That identifier has no open mapping yet. A direct movie:ID or tv:ID will still work."
                : "Try the exact title, or paste the IMDb link for the work you mean."
            }
          />
        )}

        {results && results.length > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
            {results.map((media, index) => (
              <PosterTile
                key={`${media.mediaType}-${media.id}`}
                media={media}
                priority={index < 6}
              />
            ))}
          </div>
        )}
      </div>

      <div className="app-shell">
        <SiteFooter />
      </div>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-error/10 text-error">
        <IconAlertTriangle size={20} stroke={2} />
      </span>
      <h2 className="mt-4 text-sm font-extrabold text-text">{title}</h2>
      <p className="mt-2 max-w-sm text-xs leading-5 text-text-secondary">
        {body}
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center rounded-full border border-border px-5 text-xs font-bold text-text-secondary transition-colors hover:border-text/30 hover:text-text"
      >
        Start over
      </Link>
    </div>
  );
}
