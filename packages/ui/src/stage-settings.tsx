"use client";

import { MotionPresence } from "./motion-presence";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CaretLeft,
  CaretRight,
  Check,
  Gear,
  X,
} from "@phosphor-icons/react/ssr";

const ICON = { weight: "regular" as const };

export interface SignalStrength {
  /** 1 to 5 bars, or 0 for a struck-through meter. */
  bars: number;
  tone: "green" | "orange" | "red" | "grey";
}

export interface SettingsOption {
  value: string;
  label: string;
  detail?: string;
  /** Connectivity of what this row selects, shown after the label. */
  signal?: SignalStrength;
  /** Alternatives that share this row, stepped through in place. */
  variant?: {
    index: number;
    count: number;
    onStep: (direction: 1 | -1) => void;
  };
}

export interface SettingsSection {
  id: string;
  title: string;
  options: readonly SettingsOption[];
  value: string | null;
  onChange: (value: string) => void;
  note?: string;
  empty?: string;
  summary?: string;
}

interface StageSettingsProps {
  sections: readonly SettingsSection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label?: string;
  icon?: ReactNode;
  actions?: readonly { label: string; icon: ReactNode; onClick: () => void }[];
}

const SIGNAL_TONE = {
  green: "text-success",
  orange: "text-amber-400",
  red: "text-error",
  grey: "text-stage-muted/70",
} as const;

function SignalMeter({ signal }: { signal: SignalStrength }) {
  const bars = Math.min(Math.max(Math.round(signal.bars), 0), 5);
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 17 17"
      fill="currentColor"
      // The row's detail line already names the state in words.
      aria-hidden="true"
      className={`shrink-0 ${SIGNAL_TONE[signal.tone]}`}
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <rect key={index} x={1 + index * 3.1} y={13 - index * 2.25} width="2" height={2 + index * 2.25} rx="0.6" opacity={bars > index ? 1 : 0.3} />
      ))}
      {bars === 0 && <path d="M2 3 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" />}
    </svg>
  );
}

export function StageSettings({
  sections,
  onOpenChange,
  open,
  label = "Settings",
  icon = <Gear {...ICON} size={22} />,
  actions = [],
}: StageSettingsProps) {
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Nothing renders until there is something to choose, so the stage is looked up again once the trigger exists.
  const empty = sections.length === 0 && actions.length === 0;
  const [stage, setStage] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setStage(rootRef.current?.closest<HTMLElement>(".stage") ?? null);
  }, [empty]);

  const section = sections.find((entry) => entry.id === active);

  const change = (next: boolean) => {
    if (next) setActive(null);
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (sheetRef.current?.contains(target)) return;
      change(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      change(false);
      rootRef.current?.querySelector("button")?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const body = sheetRef.current?.querySelector(".stage-sheet-body");
    (body?.querySelector<HTMLButtonElement>("[aria-pressed=true]") ??
      body?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
  }, [open, active]);

  useEffect(() => {
    if (!open && sheetRef.current?.contains(document.activeElement)) {
      rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }
  }, [open]);

  if (empty) return null;

  const sheet = (
    <>
      <button
        type="button"
        className="stage-sheet-backdrop"
        aria-label={`Dismiss ${label.toLowerCase()}`}
        onClick={() => change(false)}
      />
      <div
        ref={sheetRef}
        className="stage-sheet"
        role="dialog"
        aria-label={label}
        id={settingsId}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="stage-sheet-header">
          <div className="flex min-w-0 items-center gap-2">
            {section && (
              <button
                type="button"
                className="stage-control"
                aria-label={`Back to ${label.toLowerCase()}`}
                onClick={() => setActive(null)}
              >
                <CaretLeft {...ICON} size={18} />
              </button>
            )}
            <span>{section?.title ?? label}</span>
          </div>
          <button
            type="button"
            className="stage-control"
            aria-label={`Close ${label.toLowerCase()}`}
            onClick={() => {
              change(false);
              rootRef.current
                ?.querySelector("button")
                ?.focus({ preventScroll: true });
            }}
          >
            <X {...ICON} size={18} />
          </button>
        </div>
        <div key={active ?? "root"} className="stage-sheet-body">
          {!section && (
            <>
              {sections.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="stage-sheet-row stage-sheet-category"
                  onClick={() => setActive(entry.id)}
                >
                  <span>{entry.title}</span>
                  <span className="stage-sheet-summary">
                    {entry.summary ?? entry.options.find(
                      (option) => option.value === entry.value,
                    )?.label}
                  </span>
                  <CaretRight {...ICON} size={16} className="shrink-0 text-stage-muted" />
                </button>
              ))}
              {actions.length > 0 && (
                <div className="stage-sheet-actions">
                  {actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className="stage-sheet-row stage-sheet-category"
                      onClick={() => {
                        change(false);
                        action.onClick();
                      }}
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {section?.note && <p className="stage-sheet-note">{section.note}</p>}

          {section?.options.length === 0 && (
            <p className="px-2 py-6 text-center text-[12px] text-stage-muted">
              {section.empty ?? "Nothing to choose from"}
            </p>
          )}

          {section?.options.map((option) => {
            const selected = option.value === section.value;
            const variant = option.variant;

            const pick = (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => section.onChange(option.value)}
                className={variant ? "stage-sheet-pick" : "stage-sheet-row"}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {selected && (
                    <Check
                      size={14}
                      {...ICON}
                      className="text-phantom"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[12.5px] ${
                      selected
                        ? "font-bold text-stage-text"
                        : "font-medium text-stage-text/85"
                    }`}
                  >
                    {option.label}
                  </span>
                  {option.detail && (
                    <span className="mt-0.5 block truncate text-[10.5px] text-stage-muted">
                      {option.detail}
                    </span>
                  )}
                </span>
                {option.signal && <SignalMeter signal={option.signal} />}
              </button>
            );

            if (!variant) return pick;

            return (
              <div key={option.label} className="stage-sheet-row">
                {pick}
                <span className="stage-sheet-steps">
                  <button
                    type="button"
                    onClick={() => variant.onStep(-1)}
                    aria-label={`Previous ${option.label} version`}
                    className="stage-sheet-step"
                  >
                    <CaretLeft {...ICON} size={13} />
                  </button>
                  <span className="stage-sheet-count">
                    {variant.index + 1}/{variant.count}
                  </span>
                  <button
                    type="button"
                    onClick={() => variant.onStep(1)}
                    aria-label={`Next ${option.label} version`}
                    className="stage-sheet-step"
                  >
                    <CaretRight {...ICON} size={13} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div ref={rootRef}>
      <button
        type="button"
        onClick={() => change(!open)}
        aria-label={label}
        title={label}
        aria-controls={open ? settingsId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`stage-control stage-settings-trigger ${open ? "stage-control-selected" : ""}`}
      >
        {icon}
      </button>

      {stage
        ? createPortal(<MotionPresence open={open}>{sheet}</MotionPresence>, stage)
        : <MotionPresence open={open}>{sheet}</MotionPresence>}
    </div>
  );
}
