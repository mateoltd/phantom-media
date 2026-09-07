"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconSearch,
  IconStar,
} from "@tabler/icons-react";
import { Artwork } from "@phantom/ui";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { kindLabel, mediaHref, looksLikeIdentifier } from "@/lib/media";
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
  const [response, setResponse] = useState<{
    query: string;
    results: MediaResult[];
    error: string | null;
  } | null>(null);
  const results = response?.query === query ? response.results : null;
  const error = response?.query === query ? response.error : null;

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
        if (!controller.signal.aborted)
          setResponse({ query, results: payload.results ?? [], error: null });
      })
      .catch((cause: Error) => {
        if (cause.name === "AbortError") return;
        if (!controller.signal.aborted)
          setResponse({ query, results: [], error: cause.message });
      });

    return () => controller.abort();
  }, [query]);

  const loading = Boolean(query) && results === null && !error;
  const [selection, setSelection] = useState<{
    query: string;
    type: "all" | "movie" | "tv";
  }>({ query, type: "all" });
  const filter = selection.query === query ? selection.type : "all";
  const visibleResults = results?.filter(
    (media) => filter === "all" || media.mediaType === filter,
  );
  const filters = [
    { type: "all" as const, label: "All titles", count: results?.length ?? 0 },
    {
      type: "movie" as const,
      label: "Films",
      count:
        results?.filter((media) => media.mediaType === "movie").length ?? 0,
    },
    {
      type: "tv" as const,
      label: "Series",
      count: results?.filter((media) => media.mediaType === "tv").length ?? 0,
    },
  ];

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader initialQuery={query} />

      <section className="app-shell search-page-content">
        <div className="search-page-heading">
          <h1>
            {query ? (
              <>
                Results for <span>“{query}”</span>
              </>
            ) : (
              "Find your next watch"
            )}
          </h1>
          <p role="status">
            {loading
              ? "Searching the catalog…"
              : results && !error
                ? `${results.length} ${results.length === 1 ? "title" : "titles"} found`
                : "Films and series, all in one place."}
          </p>
        </div>

        {loading && (
          <div className="search-results-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="search-result-skeleton" key={index}>
                <span className="search-result-poster" />
                <span>
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            ))}
          </div>
        )}

        {!query && (
          <EmptyState
            title="What are you in the mood for?"
            body="Search for a title above, or paste an IMDb link."
          />
        )}
        {error && (
          <EmptyState
            title="We couldn’t load your results"
            body={error}
            error
          />
        )}
        {!error && query && results?.length === 0 && (
          <EmptyState
            title="No titles found"
            body={
              looksLikeIdentifier(query)
                ? "Try searching by title instead, or check the IMDb link."
                : "Try a different spelling, a shorter title, or an IMDb link."
            }
          />
        )}

        {results && results.length > 0 && !error && (
          <>
            <div
              className="search-filters"
              role="group"
              aria-label="Filter results"
            >
              {filters.map(({ type, label, count }) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={filter === type}
                  disabled={count === 0}
                  onClick={() => setSelection({ query, type })}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
            <ul key={`${query}:${filter}`} className="search-results-grid motion-list">
              {visibleResults?.map((media, index) => (
                <li key={`${media.mediaType}-${media.id}`}>
                  <Link
                    href={mediaHref(media)}
                    className={`search-result ${media.overview ? "" : "search-result-compact"}`}
                    aria-label={media.title}
                  >
                    <span className="search-result-poster">
                      <Artwork
                        src={media.posterUrl}
                        sizes="(max-width: 640px) 96px, 132px"
                        priority={index < 6}
                      />
                    </span>
                    <span className="search-result-copy">
                      <span className="search-result-title">{media.title}</span>
                      <span className="search-result-meta">
                        <span>{kindLabel(media.mediaType)}</span>
                        {media.year && <span>{media.year}</span>}
                        {media.rating > 0 && (
                          <span className="search-result-rating">
                            <IconStar
                              size={14}
                              stroke={1.6}
                              aria-hidden="true"
                            />
                            <span
                              aria-label={`Rated ${media.rating.toFixed(1)} out of 10`}
                            >
                              {media.rating.toFixed(1)}
                            </span>
                          </span>
                        )}
                      </span>
                      {media.overview && (
                        <span className="search-result-overview">
                          {media.overview}
                        </span>
                      )}
                      <span className="search-result-bottom">
                        <span className="search-result-genres">
                          {media.genres.slice(0, 2).join(", ")}
                        </span>
                        <span className="search-result-open" aria-hidden="true">
                          <IconArrowUpRight size={19} stroke={1.7} />
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="app-shell">
        <SiteFooter />
      </div>
    </main>
  );
}

function EmptyState({
  title,
  body,
  error = false,
}: {
  title: string;
  body: string;
  error?: boolean;
}) {
  return (
    <div className="search-empty">
      {error ? (
        <IconAlertTriangle size={30} stroke={1.4} />
      ) : (
        <IconSearch size={30} stroke={1.4} />
      )}
      <h2>{title}</h2>
      <p>{body}</p>
      <Link href="/" className="cinema-button">
        Browse titles
      </Link>
    </div>
  );
}
