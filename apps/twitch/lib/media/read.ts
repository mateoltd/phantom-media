import { UpstreamError } from "../errors.ts";
/** Bounded body consumption shared by metadata, manifests and download chunks. */
export async function readBytes(response: Response, maximum: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new UpstreamError("transport");
  const declared = Number(response.headers.get("Content-Length"));
  if (declared > maximum) { await response.body.cancel(); throw new UpstreamError("cap"); }
  const reader = response.body.getReader(), parts: Uint8Array[] = [];
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  let length = 0;
  try {
    for (;;) {
      signal?.throwIfAborted(); const chunk = await reader.read(); signal?.throwIfAborted();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maximum) throw new UpstreamError("cap");
      parts.push(chunk.value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal?.removeEventListener("abort", abort); reader.releaseLock(); }
  const output = new Uint8Array(length); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}
export async function readLimitedText(response: Response, maximum: number, signal?: AbortSignal): Promise<string> {
  return new TextDecoder().decode(await readBytes(response, maximum, signal));
}
