// Only raw subtitle paths are exposed. In particular, never forward API query keys.
export function subdlFileUrl(raw) {
  try {
    const url = new URL(raw, "https://dl.subdl.com");
    if (url.origin !== "https://dl.subdl.com" || url.username || url.password ||
        !/^\/subtitle\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

export function subdlTracks(body, { imdbId, mediaType, season, episode }) {
  if (body?.status !== true || !body.results?.some(result =>
    result.imdb_id === imdbId && result.type === mediaType)) return [];
  const tracks = [];
  const seen = new Set();
  for (const entry of body.subtitles ?? []) {
    for (const file of entry.unpack_files ?? []) {
      if (mediaType === "tv" && (Number(file.season) !== season || Number(file.episode) !== episode)) continue;
      if (!["ass", "ssa", "srt", "vtt"].includes(String(file.format).toLowerCase())) continue;
      const url = subdlFileUrl(file.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      tracks.push({ id: `subdl:${file.file_n_id}`, url,
        lang: String(file.language || entry.language || "und").toLowerCase(),
        origin: "subdl", display: file.release_name || entry.release_name,
        hearingImpaired: Boolean(file.hi),
      });
      if (tracks.length >= 30) return tracks;
    }
  }
  return tracks;
}
