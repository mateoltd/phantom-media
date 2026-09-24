const requests = new Map<string, number[]>();

export function isRateLimited(
  ip: string,
  maxRequests = 10,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const timestamps = requests.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) return true;

  recent.push(now);
  requests.set(ip, recent);
  return false;
}
