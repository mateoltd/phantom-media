"use client";

import { useEffect, useState } from "react";
import { sliceKey } from "@/lib/catalog/slices";
import type { CatalogSlice, SliceReceipt } from "@/lib/catalog/contracts";

type Result = { receipt: SliceReceipt; error?: undefined } | { receipt?: undefined; error: string };

/**
 * One request per view, made when the view is first shown and never repeated on its own.
 * Answers are kept for the life of the page, so returning to a view costs nothing, and a view the
 * server already answered (`seed`) is never asked for again. Nothing is requested while `enabled` is false.
 * `ahead` is the view about to replace this one: it is the one asked for, so its answer never waits on the swap.
 */
export function useCatalog(slice: CatalogSlice, seed?: SliceReceipt | null, enabled = true, ahead = slice) {
  const key = sliceKey(slice);
  const wanted = sliceKey(ahead);
  const [results, setResults] = useState<Record<string, Result>>(() => seed ? { [sliceKey(seed.slice)]: { receipt: seed } } : {});
  const result = results[key];
  const answered = results[wanted];

  useEffect(() => {
    if (answered || !enabled) return;
    const controller = new AbortController();
    fetch(`/api/catalog?slice=${encodeURIComponent(wanted)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "");
        return data as SliceReceipt;
      })
      .then(
        receipt => setResults(known => ({ ...known, [wanted]: { receipt } })),
        error => {
          // Leaving a view cancels its request; that is not a failure to report.
          if (controller.signal.aborted) return;
          setResults(known => ({ ...known, [wanted]: { error: (error instanceof Error && error.message) || "Twitch didn’t answer. Try again in a moment." } }));
        },
      );
    return () => controller.abort();
  }, [wanted, answered, enabled]);

  const retry = () => setResults(known => {
    const next = { ...known };
    delete next[key];
    return next;
  });
  return { receipt: result?.receipt, error: result?.error, retry };
}
