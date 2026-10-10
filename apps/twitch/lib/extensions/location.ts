import type { ExtensionEntry, HostedExtension } from "./contracts.ts";
export interface ExtensionCatalogNode { id: string; name: string; authorName: string; summary: string; iconURLs?: { square100?: unknown } | null }
function extensionIcon(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "extensions-discovery-images.twitch.tv" || url.username || url.password || url.port) return undefined;
    return url.href;
  } catch { return undefined; }
}
export function extensionIdentity(raw: ExtensionCatalogNode): ExtensionEntry {
  const match = /^([a-z0-9]{12,40}):([A-Za-z0-9._-]{1,80})$/.exec(raw.id);
  if (!match) throw new Error("Invalid extension identity");
  return { catalogId: raw.id, clientId: match[1], version: match[2], name: raw.name, author: raw.authorName, summary: raw.summary, iconUrl: extensionIcon(raw.iconURLs?.square100) };
}
export function hostedExtension(clientId: string, value: string): HostedExtension {
  if (!/^[a-z0-9]{12,40}$/.test(clientId)) throw new Error("Invalid extension client ID");
  const url = new URL(value);
  const match = /^\/([a-z0-9]+)\/([A-Za-z0-9._-]+)\/([a-f0-9]{32})\/(.+\.html)$/.exec(url.pathname);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname !== `${clientId}.ext-twitch.tv` || !match || match[1] !== clientId) throw new Error("Invalid extension viewer URL");
  url.hash = "";
  return { clientId, version: match[2], packageHash: match[3], viewerUrl: url.href, root: `${url.origin}/${clientId}/${match[2]}/${match[3]}/` };
}
export function assetDestination(value: string, location: HostedExtension): string {
  const url = new URL(value, location.viewerUrl); url.hash = "";
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Invalid asset destination");
  const helper = url.origin === "https://extension-files.twitch.tv" && url.pathname === "/helper/v1/twitch-ext.min.js";
  if (!helper && (!url.href.startsWith(location.root) || /%2f|%5c/i.test(url.pathname))) throw new Error("Asset lies outside the selected package");
  return url.href;
}
