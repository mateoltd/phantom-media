"use client";

import type { SourceProgress } from "./use-source-router";

export interface RaceProgressModel {
  sources: readonly SourceProgress[];
  answered: number;
  asking: number;
  total: number;
  elapsedMs: number;
}

/**
 * What the search is actually doing.
 *
 * A spinner and one line of text is the same picture whether three sources
 * have answered or none have, which is why a slow search felt like a stuck
 * one. A mark per source, coloured by what it said, turns the wait into
 * something with a visible end.
 *
 * The count says how many are being asked as well as how many have answered.
 * It read "0 of 14 answered" for the whole of the first wave otherwise — true,
 * and indistinguishable from a player that had given up.
 */
export function RaceProgress({ model }: { model: RaceProgressModel }) {
  const asked = model.sources.filter((source) => source.status !== "idle");
  if (asked.length === 0) return null;

  const seconds = (model.elapsedMs / 1_000).toFixed(1);

  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="stage-progress" aria-hidden="true">
        {asked.map((source) => (
          <span
            key={source.id}
            className={`stage-dot stage-dot-${source.status}`}
            title={`${source.label} — ${describe(source)}`}
          />
        ))}
      </div>
      <p className="font-mono text-[11px] tabular-nums text-stage-muted">
        {model.answered} of {asked.length} answered
        {model.asking > 0 && ` · ${model.asking} waiting`} · {seconds}s
      </p>
    </div>
  );
}

function describe(source: SourceProgress): string {
  switch (source.status) {
    case "queued":
      return "waiting its turn";
    case "asking":
      return "being asked";
    case "offered":
      return source.bestLabel
        ? `offered ${source.bestLabel}`
        : "offered a stream";
    case "holding":
      return "best so far";
    case "playing":
      return "playing";
    case "empty":
      return "nothing for this title";
    case "unreachable":
      return "did not answer";
    case "limited":
      return "rate limited";
    default:
      return source.reputation;
  }
}
