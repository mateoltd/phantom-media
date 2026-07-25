export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/_{2,}/g, "_")
    .trim()
    .replace(/^\.+|\.+$/g, "");
}

export function generateFileName(
  title: string,
  container: string,
  index?: number
): string {
  const sanitized = sanitizeFileName(title);
  const prefix = index !== undefined ? `[${index + 1}] ` : "";
  return `${prefix}${sanitized}.${container}`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
