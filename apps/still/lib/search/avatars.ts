import { ResourceCache } from "../cache.ts";
import { createPermitPool } from "../concurrency.ts";

const images = new ResourceCache<"loaded" | "failed">(192);
const decoding = createPermitPool(6, 64);
const avatar = (url?: string) => url?.replace(/^(https:\/\/static-cdn\.jtvnw\.net\/(?:jtv_user_pictures|user-default-pictures)\/[^?#]+)-\d+x\d+(\.[a-z]+)$/i, "$1-50x50$2");

export const searchAvatarReady = (url?: string) => !url || images.get(avatar(url)!) !== undefined;
export const searchAvatarURL = (url?: string) => url && images.get(avatar(url)!) === "loaded" ? avatar(url) : undefined;

/** Commit a decoded avatar or a stable fallback, never a name waiting for pixels. */
export async function prepareSearchAvatar(url?: string): Promise<void> {
  if (!url || typeof Image === "undefined") return;
  const source = avatar(url)!;
  await images.load(source, () => {
    const deadline = AbortSignal.timeout(250);
    return decoding.run(() => new Promise<"loaded" | "failed">(resolve => {
      const image = new Image();
      const finish = (state: "loaded" | "failed") => {
        deadline.removeEventListener("abort", abort); image.onload = null; image.onerror = null; resolve(state);
      };
      const abort = () => finish("failed");
      deadline.addEventListener("abort", abort, { once: true });
      image.onload = () => { void image.decode().then(() => finish("loaded"), () => finish("failed")); };
      image.onerror = () => finish("failed");
      image.src = source;
    }), deadline);
  }, state => state === "loaded" ? 86_400_000 : 30_000).catch(() => { images.set(source, "failed", 30_000); });
}
