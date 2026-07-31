import { proxyVidfastRequest } from "../../../../../src/providers/vidfast-proxy.mjs";

export const runtime = "nodejs";

export function GET(request) {
  return proxyVidfastRequest(request);
}

export function HEAD(request) {
  return proxyVidfastRequest(request);
}
