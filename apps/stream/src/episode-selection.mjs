function integer(value, minimum) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

export function parseEpisodeSelection(season, episode) {
  const parsedSeason = integer(season, 0);
  const parsedEpisode = integer(episode, 1);
  return parsedSeason === null || parsedEpisode === null
    ? null
    : { season: parsedSeason, episode: parsedEpisode };
}

export function resolveEpisodeSelection(seasons, episodes, requested) {
  if (
    requested &&
    (episodes.length === 0 ||
      episodes.some(
        (item) =>
          item.seasonNumber === requested.season &&
          item.episodeNumber === requested.episode,
      ))
  ) {
    return requested;
  }

  const firstEpisode =
    episodes.find((item) => item.seasonNumber > 0) ?? episodes[0];
  if (firstEpisode) {
    return {
      season: firstEpisode.seasonNumber,
      episode: firstEpisode.episodeNumber,
    };
  }

  const firstSeason =
    seasons.find((item) => item.seasonNumber > 0) ?? seasons[0];
  return { season: firstSeason?.seasonNumber ?? 1, episode: 1 };
}

export function episodeSelectionFromUrl(href, seasons, episodes) {
  const url = new URL(href, "http://localhost");
  return resolveEpisodeSelection(
    seasons,
    episodes,
    parseEpisodeSelection(
      url.searchParams.get("season"),
      url.searchParams.get("episode"),
    ),
  );
}

export function urlWithEpisodeSelection(href, selection) {
  const url = new URL(href, "http://localhost");
  url.searchParams.set("season", String(selection.season));
  url.searchParams.set("episode", String(selection.episode));
  return `${url.pathname}${url.search}${url.hash}`;
}
