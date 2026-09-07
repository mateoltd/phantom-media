"use client";

import { MotionPresence } from "@/components/motion-presence";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  IconAntennaBars1,
  IconAntennaBars2,
  IconAntennaBars3,
  IconAntennaBars4,
  IconAntennaBars5,
  IconAntennaBarsOff,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconSettings,
  IconX,
} from "@tabler/icons-react";

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

const SIGNAL_ICON = [
  IconAntennaBarsOff,
  IconAntennaBars1,
  IconAntennaBars2,
  IconAntennaBars3,
  IconAntennaBars4,
  IconAntennaBars5,
] as const;

const SIGNAL_TONE = {
  green: "text-success",
  orange: "text-amber-400",
  red: "text-error",
  grey: "text-stage-muted/70",
} as const;

function SignalMeter({ signal }: { signal: SignalStrength }) {
  const bars = Math.min(Math.max(Math.round(signal.bars), 0), 5);
  const Icon = SIGNAL_ICON[bars] ?? IconAntennaBars1;
  return (
    <Icon
      size={17}
      stroke={2.1}
      // The row's detail line already names the state in words.
      aria-hidden="true"
      className={`shrink-0 ${SIGNAL_TONE[signal.tone]}`}
    />
  );
}

export function StageSettings({
  sections,
  onOpenChange,
  open,
  label = "Settings",
  icon = <IconSettings size={22} stroke={1.5} />,
  actions = [],
}: StageSettingsProps) {
  const [availableHeight, setAvailableHeight] = useState<number | undefined>();
  const [active, setActive] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  const [stage, setStage] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setStage(rootRef.current?.closest<HTMLElement>(".stage") ?? null);
  }, []);

  const section = sections.find((entry) => entry.id === active);

  const change = (next: boolean) => {
    if (next && window.innerWidth > 640) {
      const triggerTop =
        rootRef.current?.getBoundingClientRect().top ?? window.innerHeight;
      const header = document.fullscreenElement
        ? 0
        : (document.querySelector(".stream-header")?.getBoundingClientRect()
            .bottom ?? 0);
      setAvailableHeight(Math.max(160, triggerTop - header - 40));
    } else {
      setAvailableHeight(undefined);
    }
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

  if (sections.length === 0 && actions.length === 0) return null;

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
        style={{ maxHeight: availableHeight }}
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
                <IconChevronLeft size={18} />
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
            <IconX size={18} />
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
                  <IconChevronRight size={16} className="shrink-0 text-stage-muted" />
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
                    <IconCheck
                      size={14}
                      stroke={2.6}
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
                    <IconChevronLeft size={13} stroke={2.6} />
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
                    <IconChevronRight size={13} stroke={2.6} />
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
