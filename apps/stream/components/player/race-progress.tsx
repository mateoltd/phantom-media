"use client";

import type { SourceProgress } from "./use-source-router";

export interface RaceProgressModel {
  sources: readonly SourceProgress[];
  answered: number;
  asking: number;
  total: number;
  elapsedMs: number;
}

export function RaceProgress({ model }: { model: RaceProgressModel }) {
  const asked = model.sources.filter((source) => source.status !== "idle");
  if (asked.length === 0) return null;

  const seconds = (model.elapsedMs / 1_000).toFixed(1);

  return (
    <div className="flex w-full flex-col items-center gap-2 sm:gap-2.5">
      <div className="stage-progress" aria-hidden="true">
        {asked.map((source) => (
          <span
            key={source.id}
            className={`stage-dot stage-dot-${source.status}`}
            title={`${source.label}: ${describe(source)}`}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] tabular-nums text-stage-muted sm:text-[11px]">
        {model.answered} of {asked.length} answered
        {model.asking > 0 && `, ${model.asking} waiting`} in {seconds}s
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
    case "unplayable":
      return "stream links did not play";
    case "slow":
      return "too slow this time";
    case "unreachable":
      return "did not answer";
    case "limited":
      return "rate limited";
    default:
      return source.reputation;
  }
}
