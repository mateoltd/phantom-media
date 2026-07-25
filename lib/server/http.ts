import "server-only";

const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

export class HttpInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 | 415 = 400
  ) {
    super(message);
    this.name = "HttpInputError";
  }
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes = 16 * 1024
): Promise<T> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new HttpInputError("Content-Type must be application/json", 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpInputError("Request body is too large", 413);
  }

  if (!request.body) {
    throw new HttpInputError("Request body is required");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let source = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new HttpInputError("Request body is too large", 413);
      }
      source += decoder.decode(value, { stream: true });
    }
    source += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(source) as T;
  } catch {
    throw new HttpInputError("Request body must be valid JSON");
  }
}

export function getClientIp(request: Request): string {
  const configuredHeader =
    process.env.DOWNLOAD_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!configuredHeader || !HEADER_NAME_PATTERN.test(configuredHeader)) {
    return "unknown";
  }
  const headerName = configuredHeader;
  const value = request.headers.get(headerName);
  const address = value?.split(",")[0]?.trim();
  return address?.slice(0, 128) || "unknown";
}

export function noStoreJsonHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
