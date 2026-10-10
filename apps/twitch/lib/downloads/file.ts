import type { OutputSink, ProgressListener } from "./types.ts";
import { readBytes } from "../media/read.ts";
export interface FileLocation { url: string; identity: string }
async function range(location: FileLocation, start: number, end: number, signal: AbortSignal) {
  const response = await fetch(location.url, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
  if (response.status === 401 || response.status === 403) { await response.body?.cancel(); return null; }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("Content-Range") ?? "");
  if (response.status !== 206 || !match || Number(match[1]) !== start || Number(match[2]) > end || Number(match[2]) < start || Number(match[3]) <= Number(match[2])) { await response.body?.cancel(); throw new Error("Server did not return a valid file range"); }
  const data = await readBytes(response, end - start + 1, signal);
  if (data.byteLength !== Number(match[2]) - start + 1) throw new Error("Incomplete file range");
  return { data, total: Number(match[3]), validator: response.headers.get("ETag") ?? response.headers.get("Last-Modified") };
}
export async function downloadFile(initial: FileLocation, refresh: (() => Promise<FileLocation>) | undefined, sink: OutputSink, progress: ProgressListener, signal: AbortSignal) {
  let location = initial, offset = 0, total = 0, signatureRefreshes = 0;
  let anchor: Uint8Array | undefined, validator: string | null = null;
  while (!total || offset < total) {
    signal.throwIfAborted();
    const result = await range(location, offset, offset + 4 * 1024 * 1024 - 1, signal);
    if (!result) {
      if (!refresh || signatureRefreshes++ >= 2) throw new Error("Clip signing expired; download stopped");
      const next = await refresh();
      if (next.identity !== initial.identity) throw new Error("Clip representation changed; download stopped");
      if (anchor) {
        const probe = await range(next, 0, anchor.byteLength - 1, signal);
        if (!probe || probe.total !== total || (validator && probe.validator !== validator) || !anchor.every((byte, index) => probe.data[index] === byte)) throw new Error("Clip bytes changed; download stopped");
      }
      location = next; continue;
    }
    if (total && (result.total !== total || (validator && result.validator !== validator))) throw new Error("Clip representation changed; download stopped");
    total = result.total; validator = result.validator;
    if (!anchor) anchor = result.data.slice(0, Math.min(65536, result.data.byteLength));
    await sink.write(result.data); offset += result.data.byteLength;
    progress({ phase: "downloading", downloaded: offset, total, bytes: offset });
  }
}
