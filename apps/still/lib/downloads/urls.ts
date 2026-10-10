/** External media uses the same validated streaming boundary as playback. */
export function browserMediaUrl(url: string): string {
  const absolute = new URL(url, location.href);
  return absolute.origin === location.origin ? absolute.href : `/api/proxy?url=${encodeURIComponent(absolute.href)}`;
}
