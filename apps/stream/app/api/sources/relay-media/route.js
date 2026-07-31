import { proxyWrapperMediaRequest } from "../../../../src/providers/wrapper-media-proxy.mjs";

export const runtime = "nodejs";

export function GET(request) {
  return proxyWrapperMediaRequest(request);
}

export function HEAD(request) {
  return proxyWrapperMediaRequest(request);
}
