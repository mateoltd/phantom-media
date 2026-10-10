const DEBUG_ENABLED = process.env.DEBUG === "1";

export function isDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}

export function debugServer(
  scope: string,
  message: string,
  details?: Record<string, unknown>
): void {
  if (!DEBUG_ENABLED) return;

  const prefix = `[debug][${new Date().toISOString()}][${scope}] ${message}`;
  if (details) {
    console.log(prefix, details);
    return;
  }

  console.log(prefix);
}
