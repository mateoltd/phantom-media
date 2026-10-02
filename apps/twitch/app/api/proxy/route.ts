import { proxyMedia } from "@/lib/media-proxy";

// Next dev uses the same handler as the production Worker's media fast path.
export const GET = proxyMedia;
