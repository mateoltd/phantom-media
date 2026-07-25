import "server-only";

const MAX_LOG_LENGTH = 4_000;

export function logServerError(context: string, error: unknown): void {
  const source =
    error instanceof Error
      ? error.stack || error.message
      : typeof error === "string"
        ? error
        : "Unknown server error";
  const proxyUrl = process.env.EWYOUTUBE_PROXY_URL?.trim();
  const sanitized = (proxyUrl ? source.replaceAll(proxyUrl, "[proxy]") : source)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, "$1[credentials]@")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .slice(0, MAX_LOG_LENGTH);

  console.error(`[${context}] ${sanitized}`);
}
