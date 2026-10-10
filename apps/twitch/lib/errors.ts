export type FailureKind = "not-found" | "unavailable" | "integrity" | "rate-limit" | "schema" | "transport" | "cap";

const statuses: Record<FailureKind, number> = {
  "not-found": 404, unavailable: 403, integrity: 403, "rate-limit": 429,
  schema: 502, transport: 502, cap: 400,
};
const messages: Record<FailureKind, string> = {
  "not-found": "Resource not found", unavailable: "This media is unavailable",
  integrity: "Twitch is blocking this request", "rate-limit": "Twitch is cooling down",
  schema: "Twitch returned an incompatible response", transport: "Twitch is temporarily unavailable",
  cap: "Request exceeds the supported limit",
};

export class UpstreamError extends Error {
  readonly status: number;
  readonly kind: FailureKind;
  readonly retryAfter: number;
  constructor(kind: FailureKind, retryAfter = 0) {
    super(messages[kind]);
    this.name = "UpstreamError";
    this.kind = kind;
    this.retryAfter = retryAfter;
    this.status = statuses[kind];
  }
}

export function errorResponse(error: unknown): Response {
  const failure = error instanceof UpstreamError ? error : new UpstreamError("transport");
  return Response.json({ error: failure.message, code: failure.kind }, {
    status: failure.status,
    headers: { "Cache-Control": "no-store", ...(failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {}) },
  });
}
