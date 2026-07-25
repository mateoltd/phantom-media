"use client";

import { IconChevronRight } from "@tabler/icons-react";
import { Button } from "@phantom/ui";

export type RouterStatus = "idle" | "working" | "ready" | "error";

export interface SourceEntry {
  id: string;
  label: string;
}

interface SourcePanelProps {
  sources: readonly SourceEntry[];
  status: RouterStatus;
  statusText: string;
  detail: string;
  activeSource: string | null;
  /** Sources that failed this session and are being skipped for now. */
  cooling: ReadonlySet<string>;
  canRoute: boolean;
  onAutoRoute: () => void;
  onPickSource: (id: string) => void;
}

const DOT_TONE: Record<RouterStatus, string> = {
  idle: "bg-text-tertiary",
  working: "bg-phantom animate-pulse",
  ready: "bg-success",
  error: "bg-error",
};

/**
 * Auto routing is the path almost everyone should take, so it is the only
 * button here. The roster below it exists for the case auto gets wrong, and
 * reads as a list of records rather than a menu of brands.
 */
export function SourcePanel({
  sources,
  status,
  statusText,
  detail,
  activeSource,
  cooling,
  canRoute,
  onAutoRoute,
  onPickSource,
}: SourcePanelProps) {
  return (
    <aside className="surface-card flex min-h-0 flex-col rounded-2xl">
      <div className="border-b border-black/[0.07] p-4">
        <p className="font-mono text-[10px] font-bold uppercase text-phantom">
          Source router
        </p>
        <h2 className="mt-1 text-[15px] font-extrabold text-text">
          Whichever one answers.
        </h2>

        <div className="mt-4 flex items-start gap-2.5">
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_TONE[status]}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-5 text-text">
              {statusText}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-text-tertiary">
              {detail}
            </p>
          </div>
        </div>

        <Button
          onClick={onAutoRoute}
          disabled={!canRoute}
          className="mt-4 w-full justify-between px-4"
        >
          <span className="flex flex-col items-start">
            <span className="font-mono text-[9px] font-bold uppercase opacity-70">
              Recommended
            </span>
            Route automatically
          </span>
          <IconChevronRight size={18} stroke={2.2} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        {sources.map((source) => {
          const active = source.id === activeSource;
          const isCooling = cooling.has(source.id);

          return (
            <button
              key={source.id}
              type="button"
              disabled={!canRoute}
              onClick={() => onPickSource(source.id)}
              aria-current={active}
              className="flex w-full items-center justify-between gap-3 border-b border-black/[0.07] py-3 text-left transition-colors last:border-b-0 hover:bg-bg/60 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span
                className={`truncate text-[13px] font-extrabold ${
                  active ? "text-phantom" : "text-text"
                }`}
              >
                {source.label}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase text-text-tertiary">
                {active ? "playing" : isCooling ? "cooling" : "try"}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
