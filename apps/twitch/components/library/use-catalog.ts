"use client";

import { useEffect, useState } from "react";
import { sliceKey } from "@/lib/catalog/slices";
import type { CatalogSlice, SliceReceipt } from "@/lib/catalog/contracts";

type Result = { receipt: SliceReceipt; error?: undefined } | { receipt?: undefined; error: string };

/**
 * One request per view, made when the view is first shown and never repeated on its own.
 * Answers are kept for the life of the page, so returning to a view costs nothing, and a view the
 * server already answered (`seed`) is never asked for again. Nothing is requested while `enabled` is false.
 */
export function useCatalog(slice: CatalogSlice, seed?: SliceReceipt | null, enabled = true) {
  const key = sliceKey(slice);
  const [results, setResults] = useState<Record<string, Result>>(() => seed ? { [sliceKey(seed.slice)]: { receipt: seed } } : {});
  const result = results[key];

  useEffect(() => {
    if (result || !enabled) return;
    const controller = new AbortController();
    fetch(`/api/catalog?slice=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "");
        return data as SliceReceipt;
      })
      .then(
        receipt => setResults(known => ({ ...known, [key]: { receipt } })),
        error => {
          // Leaving a view cancels its request; that is not a failure to report.
          if (controller.signal.aborted) return;
          setResults(known => ({ ...known, [key]: { error: (error instanceof Error && error.message) || "Twitch didn’t answer. Try again in a moment." } }));
        },
      );
    return () => controller.abort();
  }, [key, result, enabled]);

  const retry = () => setResults(known => {
    const next = { ...known };
    delete next[key];
    return next;
  });
  return { receipt: result?.receipt, error: result?.error, retry };
}
