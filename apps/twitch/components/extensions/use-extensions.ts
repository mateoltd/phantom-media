"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetCollection, ExtensionEntry } from "@/lib/extensions/contracts";

export function useExtensions() {
  const [entries, setEntries] = useState<ExtensionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/extensions", { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Extensions couldn’t be loaded.");
      if (!controller.signal.aborted) setEntries(data.entries);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Extensions couldn’t be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return { entries, loading, error };
}

export function useExtensionAssets(clientId: string) {
  const [collection, setCollection] = useState<AssetCollection>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  async function collect() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/extensions/collect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(response.status === 404 ? "This extension’s files aren’t available." : response.status === 429 ? "Downloads are busy. Try again later." : "The download couldn’t be prepared.");
      if (!controller.signal.aborted) setCollection(data);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The files couldn’t be collected.");
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setLoading(false);
  }
  function save() {
    if (!collection) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${collection.location.clientId}-${collection.location.version}-assets.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return { collection, loading, error, collect, cancel, save };
}
