import { runQuery } from "./gql.ts";
import { ResourceCache } from "../cache.ts";
import { UpstreamError } from "../errors.ts";
import { extensionIdentity, hostedExtension, type ExtensionCatalogNode } from "../extensions/location.ts";
import type { ExtensionEntry, HostedExtension } from "../extensions/contracts.ts";
const catalogs = new ResourceCache<ExtensionEntry[]>(1);
const viewers = new ResourceCache<HostedExtension | null>(48);
export function fetchExtensions(signal?: AbortSignal): Promise<ExtensionEntry[]> {
  return catalogs.load("first-20", async () => {
    const read = (icons: boolean) => runQuery<{ extensions: { edges: { node: ExtensionCatalogNode }[] } }>(`query ExtensionCatalog { extensions(first:20) { edges { node { id name authorName summary ${icons ? "iconURLs { square100 }" : ""} } } } }`, undefined, { discovery: true });
    const data = await read(true).catch(error => {
      // Optional artwork must not take down the catalog when Twitch's shape changes.
      if (error instanceof UpstreamError && error.kind === "schema") return read(false);
      throw error;
    });
    if (!Array.isArray(data.extensions?.edges)) throw new UpstreamError("schema");
    return data.extensions.edges.flatMap(({ node }) => { try { return [extensionIdentity(node)]; } catch { return []; } });
  }, 300_000, signal);
}
export function fetchExtensionViewer(clientId: string, signal?: AbortSignal): Promise<HostedExtension | null> {
  if (!/^[a-z0-9]{12,40}$/.test(clientId)) return Promise.reject(new UpstreamError("not-found"));
  return viewers.load(clientId, async () => {
    const data = await runQuery<{ extension: { viewerURL: string | null } | null }>(`query ExtensionViewer($id: ID!) { extension(id:$id) { viewerURL } }`, { id: clientId }, { discovery: true });
    if (!data.extension?.viewerURL) return null;
    try { return hostedExtension(clientId, data.extension.viewerURL); } catch { throw new UpstreamError("schema"); }
  }, 300_000, signal);
}
