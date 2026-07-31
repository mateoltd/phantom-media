export interface EpisodeSelection {
  season: number;
  episode: number;
}

interface SeasonLike {
  seasonNumber: number;
}

interface EpisodeLike extends SeasonLike {
  episodeNumber: number;
}

export function parseEpisodeSelection(
  season: unknown,
  episode: unknown,
): EpisodeSelection | null;

export function resolveEpisodeSelection(
  seasons: readonly SeasonLike[],
  episodes: readonly EpisodeLike[],
  requested: EpisodeSelection | null,
): EpisodeSelection;

export function episodeSelectionFromUrl(
  href: string,
  seasons: readonly SeasonLike[],
  episodes: readonly EpisodeLike[],
): EpisodeSelection;

export function urlWithEpisodeSelection(
  href: string,
  selection: EpisodeSelection,
): string;
