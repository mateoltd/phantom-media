import { ResourceCache } from "../cache.ts";
import { readBytes } from "../media/read.ts";
import { parseStoryboards, type Storyboard } from "./storyboards.ts";

/** A descriptor is shared by seek previews, independently of playback. */
export function createStoryboardLoader(fetcher: typeof fetch = fetch) {
  const cache = new ResourceCache<Storyboard>(12, 1_000_000, board => JSON.stringify(board).length * 2);
  return (url: string, signal?: AbortSignal) => cache.load(url, async () => {
    const deadline = AbortSignal.timeout(15_000);
    const response = await fetcher(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: deadline });
    const bytes = await readBytes(response, 256_000, deadline);
    const boards = parseStoryboards(JSON.parse(new TextDecoder().decode(bytes)), url);
    const board = boards.find(candidate => candidate.quality === "high") ?? boards[0];
    if (!board) throw new Error("No storyboard frames available");
    return board;
  }, 30_000, signal);
}

export const loadStoryboard = createStoryboardLoader();
