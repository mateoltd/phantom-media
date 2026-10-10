import type { DiscoveryContinuation } from "./ranking.ts";

const LIFETIME = 10 * 60_000;
const MAX_TOKEN = 2048;
interface CategoryPlan { games: string[]; languages: string[]; expires: number }

export class DiscoveryContinuationError extends Error {
  constructor() { super("Invalid discovery cursor or languages"); }
}

function encode(plan: CategoryPlan): string {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  return `plan_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

/** App-owned first-page categories travel with the request, across Worker isolates. */
export function createDiscoveryContinuation(games: string[], languages: string[], expires = Date.now() + LIFETIME): DiscoveryContinuation | undefined {
  const remaining = [...new Set(games)].filter(game => game.trim() && game.length <= 100 && !/[\u0000-\u001f\u007f]/.test(game)).slice(0, 6);
  const normalized = [...new Set(languages.map(language => language.toUpperCase()))];
  while (remaining.length) {
    const cursor = encode({ games: remaining, languages: normalized, expires });
    if (cursor.length <= MAX_TOKEN) return { cursor, languages: normalized };
    remaining.pop();
  }
  return undefined;
}

export function readDiscoveryContinuation(cursor: string, languages: string[]): CategoryPlan {
  try {
    if (cursor.length > MAX_TOKEN || !/^plan_[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const bytes = Uint8Array.from(atob(cursor.slice(5).replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
    const plan: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error();
    const { games, languages: context, expires } = plan as CategoryPlan;
    if (!Array.isArray(games) || !games.length || games.length > 6 || games.some(game => typeof game !== "string" || !game.trim() || game.length > 100 || /[\u0000-\u001f\u007f]/.test(game)) || new Set(games).size !== games.length ||
        !Array.isArray(context) || context.length > 3 || context.some(language => typeof language !== "string" || !/^[A-Z]{2}$/.test(language)) || new Set(context).size !== context.length ||
        JSON.stringify(context) !== JSON.stringify([...new Set(languages.map(language => language.toUpperCase()))]) ||
        !Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + LIFETIME) throw new Error();
    return { games, languages: context, expires };
  } catch { throw new DiscoveryContinuationError(); }
}
