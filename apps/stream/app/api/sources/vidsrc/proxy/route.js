import { proxyVidsrcRequest } from "../../../../../src/providers/vidsrc-proxy.mjs";

export const runtime = "nodejs";

export function GET(request) {
  return proxyVidsrcRequest(request);
}

export function HEAD(request) {
  return proxyVidsrcRequest(request);
}
