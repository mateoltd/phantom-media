export const MAX_STORYBOARD_SHEET_PIXELS = 8_000_000;

export interface Storyboard {
  count: number;
  width: number;
  height: number;
  rows: number;
  cols: number;
  interval: number;
  images: string[];
  quality: string;
}

export interface StoryboardFrame {
  url: string;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  position: number;
}

function positiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= maximum;
}

export function parseStoryboards(value: unknown, base: string): Storyboard[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error("Invalid storyboard descriptor");
  const source = new URL(base);
  if (source.protocol !== "https:" || source.username || source.password ||
    !/^[a-z0-9]+\.cloudfront\.net$|^[a-z0-9-]+\.twitch\.tv$/.test(source.hostname)) {
    throw new Error("Invalid storyboard source");
  }
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Record<string, unknown>;
    if (!positiveInteger(raw.count, 25_000) || !positiveInteger(raw.width, 640) ||
      !positiveInteger(raw.height, 640) || !positiveInteger(raw.rows, 1000) ||
      !positiveInteger(raw.cols, 1000) || typeof raw.interval !== "number" ||
      !Number.isFinite(raw.interval) || raw.interval <= 0 ||
      !Array.isArray(raw.images) || raw.images.length > 256) return [];

    const { count, width, height, rows, cols, interval } = raw;
    const cells = rows * cols;
    if (cells > 1000 || width * height * cells > MAX_STORYBOARD_SHEET_PIXELS) return [];
    const images = raw.images.map((image: unknown) => {
      if (typeof image !== "string") throw new Error("Invalid sheet");
      const url = new URL(image, base);
      if (url.origin !== source.origin || !url.pathname.endsWith(".jpg") || url.username || url.password) {
        throw new Error("Invalid sheet");
      }
      return url.href;
    });
    if (images.length * cells < count) return [];
    return [{ count, width, height, rows, cols, interval, images,
      quality: typeof raw.quality === "string" ? raw.quality : "unknown" }];
  });
}

export function storyboardFrame(board: Storyboard, time: number): StoryboardFrame | null {
  if (!Number.isFinite(time) || time < 0) return null;
  const index = Math.min(board.count - 1, Math.floor(time / board.interval));
  const cells = board.rows * board.cols;
  const cell = index % cells;
  const url = board.images[Math.floor(index / cells)];
  return url ? {
    url, width: board.width, height: board.height,
    sourceX: cell % board.cols * board.width,
    sourceY: Math.floor(cell / board.cols) * board.height,
    position: index * board.interval,
  } : null;
}
