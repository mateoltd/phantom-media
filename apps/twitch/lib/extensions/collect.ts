import { readBytes } from "../media/read.ts";
import { createPermitPool } from "../concurrency.ts";
import type { AssetCollection, HostedExtension, CollectedAsset } from "./contracts.ts";
import { assetDestination } from "./location.ts";
const collections = createPermitPool(2, 4);
const MAX_FILE = 2 * 1024 * 1024, MAX_TOTAL = 8 * 1024 * 1024, MAX_FILES = 32;
export function staticReferences(text: string, contentType: string, base: string): string[] {
  const refs: string[] = [];
  if (/html/.test(contentType)) for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.push(match[1].replaceAll("&amp;", "&"));
  if (/css/.test(contentType)) {
    for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)) refs.push(match[1]);
    for (const match of text.matchAll(/@import\s*["']([^"']+)["']/gi)) refs.push(match[1]);
  }
  if (/javascript/.test(contentType)) for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)) if (match[1].startsWith(".") || match[1].startsWith("/")) refs.push(match[1]);
  return [...new Set(refs.filter(ref => !ref.startsWith("#") && !ref.startsWith("data:")).flatMap(ref => { try { return [new URL(ref, base).href]; } catch { return []; } }))];
}
async function fetchAsset(url: string, location: HostedExtension, signal: AbortSignal): Promise<{ asset: CollectedAsset; text: string }> {
  let destination = assetDestination(url, location);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 2; redirects++) {
    response = await fetch(destination, { redirect: "manual", signal, cache: "no-store" });
    if (![301,302,303,307,308].includes(response.status)) break;
    await response.body?.cancel(); const next = response.headers.get("Location");
    if (!next || redirects === 2) throw new Error("Asset redirect limit");
    destination = assetDestination(new URL(next, destination).href, location);
  }
  if (!response?.ok || !response.body) { await response?.body?.cancel(); throw new Error(`Asset returned ${response?.status ?? "no response"}`); }
  const data = await readBytes(response, MAX_FILE, signal), size = data.byteLength;
  let binary = ""; for (let start = 0; start < data.length; start += 8192) binary += String.fromCharCode(...data.subarray(start,start+8192));
  const contentType = response.headers.get("Content-Type") ?? "application/octet-stream";
  return { asset: { url: destination, contentType, bytes: size, base64: btoa(binary) }, text: /html|css|javascript/.test(contentType) ? new TextDecoder().decode(data) : "" };
}
export function collectExtension(location: HostedExtension, signal?: AbortSignal): Promise<AssetCollection> {
  return collections.run(() => collect(location, signal), signal);
}
async function collect(location: HostedExtension, signal?: AbortSignal): Promise<AssetCollection> {
  const stop = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
  const result: AssetCollection = { location, assets: [], totalBytes: 0, skipped: [], failures: [], coverage: "static-references-only", stop: "finished" };
  const seen = new Set<string>(), queue: { url: string; depth: number }[] = [{ url: location.viewerUrl, depth: 0 }];
  while (queue.length) {
    stop.throwIfAborted();
    if (seen.size >= MAX_FILES || result.totalBytes >= MAX_TOTAL) { result.stop = "budget"; break; }
    const batch = queue.splice(0, Math.min(2, MAX_FILES-seen.size)).filter(item => !seen.has(item.url));
    batch.forEach(item => seen.add(item.url));
    const fetched = await Promise.allSettled(batch.map(item => fetchAsset(item.url, location, stop)));
    for (let index = 0; index < fetched.length; index++) {
      const response = fetched[index], request = batch[index];
      if (response.status === "rejected") { if (stop.aborted) throw stop.reason; result.failures.push({ url: request.url, reason: response.reason instanceof Error ? response.reason.message : "Asset unavailable" }); continue; }
      if (result.totalBytes + response.value.asset.bytes > MAX_TOTAL) { result.stop = "budget"; return result; }
      result.assets.push(response.value.asset); result.totalBytes += response.value.asset.bytes;
      if (request.depth >= 2) continue;
      for (const reference of staticReferences(response.value.text, response.value.asset.contentType, response.value.asset.url)) {
        try { const url = assetDestination(reference, location); if (!seen.has(url) && !queue.some(item => item.url === url)) { if (queue.length >= MAX_FILES) { result.stop = "budget"; continue; } queue.push({ url, depth: request.depth + 1 }); } }
        catch { if (result.skipped.length < 64) result.skipped.push(reference); }
      }
    }
  }
  return result;
}
