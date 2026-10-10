import type { VideoDetails } from "../playback/data.ts";
import type { Chapter, Classification } from "../contracts.ts";
import { UpstreamError } from "../errors.ts";
import { ResourceCache } from "../cache.ts";
import { executeBatch, type Operation } from "./gql.ts";
import { PERSISTED, type PersistedName } from "./operations.ts";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new UpstreamError("schema");
  return value as Record<string, unknown>;
}
export function parseChapters(data: unknown): Chapter[] {
  const video = record(record(data).video);
  const moments = record(video.moments);
  if (!Array.isArray(moments.edges)) throw new UpstreamError("schema");
  const chapters = new Map<string, Chapter>();
  for (const edge of moments.edges) {
    const node = (edge && typeof edge === "object" ? edge.node : null) as Record<string, unknown> | null;
    if (!node || node.type !== "GAME_CHANGE" || typeof node.id !== "string") continue;
    const start = typeof node.positionMilliseconds === "number" ? node.positionMilliseconds / 1000 : NaN;
    const duration = typeof node.durationMilliseconds === "number" ? node.durationMilliseconds / 1000 : NaN;
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(start + duration)) continue;
    const details = node.details as { game?: { id?: string; displayName?: string } } | undefined;
    chapters.set(node.id, { id: node.id, start, end: start + duration,
      title: typeof node.description === "string" && node.description ? node.description : details?.game?.displayName ?? "Chapter",
      gameId: details?.game?.id });
  }
  return [...chapters.values()].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
export function parseClassification(data: unknown): Classification {
  const video = record(record(data).video);
  const raw = video.contentClassificationLabels;
  if (raw !== null && raw !== undefined && !Array.isArray(raw)) throw new UpstreamError("schema");
  const game = video.game as { name?: string } | null;
  return {
    broadcastType: typeof video.broadcastType === "string" ? video.broadcastType : undefined,
    game: game && typeof game.name === "string" ? game.name : undefined,
    labels: (Array.isArray(raw) ? raw : []).flatMap(value => {
      if (!value || typeof value.id !== "string") return [];
      return [{ id: value.id, name: typeof value.localizedName === "string" ? value.localizedName : value.id }];
    }),
  };
}
const details = new ResourceCache<VideoDetails>(64);
function pinned<T>(name: PersistedName, variables: Record<string, unknown>, validate: (data: unknown) => T): Operation<T> {
  return { name, family: PERSISTED[name].family, validate,
    document: { operationName: name, variables, extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED[name].hash } } } };
}
export function fetchVideoDetails(id: string, signal?: AbortSignal): Promise<VideoDetails> {
  if (!/^\d{1,20}$/.test(id)) return Promise.reject(new UpstreamError("not-found"));
  return details.load(id, async () => {
    const results = await executeBatch([
      pinned("VideoPlayer_ChapterSelectButtonVideo", { includePrivate: false, videoID: id }, parseChapters),
      pinned("ContentClassificationContext", { clipSlug: "", isStream: false, isClip: false, isVOD: true, vodID: id }, parseClassification),
    ]).catch(() => []);
    return { chapters: results[0]?.ok ? results[0].data as Chapter[] : [],
      classification: results[1]?.ok ? results[1].data as Classification : undefined,
      availability: { chapters: results[0]?.ok ? "available" : "unavailable", classification: results[1]?.ok ? "available" : "unavailable" } };
  }, 30_000, signal);
}
