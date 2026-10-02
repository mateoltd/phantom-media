import nextWorker from "./.open-next/worker.js";
import { proxyMedia } from "./lib/media-proxy.ts";

export * from "./.open-next/worker.js";

// TODO(tanstack-migration): Replace Next.js/OpenNext with TanStack Start, move
// media streaming into its native server route, and remove this temporary
// custom Worker entry point. Reassess proxying as part of that migration.
const worker = {
  ...nextWorker,
  fetch(request, env, ctx) {
    if (request.method === "GET" && new URL(request.url).pathname === "/api/proxy") {
      return proxyMedia(request);
    }
    return nextWorker.fetch(request, env, ctx);
  },
};

export default worker;
