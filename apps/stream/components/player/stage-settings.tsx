"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
}

interface StageSettingsProps {
  sections: readonly SettingsSection[];
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
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
  children,
}: StageSettingsProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const [stage, setStage] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setStage(rootRef.current?.closest<HTMLElement>(".stage") ?? null);
  }, []);

  const section = sections.find((entry) => entry.id === active) ?? sections[0];

  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
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
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (sections.length === 0) return null;

  // Three tabs is the most that reads at this width, so the strip wraps and the
  // count is spread evenly rather than leaving a lone tab on the second row.
  const tabRows = Math.ceil(sections.length / 3);
  const tabColumns = Math.ceil(sections.length / tabRows);

  const sheet = (
    <div
      ref={sheetRef}
      className="stage-sheet"
      role="dialog"
      aria-label="Playback settings"
    >
      {sections.length > 1 && (
        <div
          className="stage-sheet-tabs"
          role="tablist"
          style={{ "--sheet-tabs": tabColumns } as CSSProperties}
        >
          {sections.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === section?.id}
              onClick={() => setActive(entry.id)}
              className="stage-sheet-tab"
            >
              {entry.title}
            </button>
          ))}
        </div>
      )}

      <div className="stage-sheet-body" role="tabpanel">
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
              role="option"
              aria-selected={selected}
              onClick={() => section.onChange(option.value)}
              className={variant ? "stage-sheet-pick" : "stage-sheet-row"}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {selected && (
                  <IconCheck size={14} stroke={2.6} className="text-phantom" />
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
  );

  return (
    <div ref={rootRef}>
      <button
        type="button"
        onClick={() => change(!open)}
        aria-label="Settings"
        title="Settings"
        aria-expanded={open}
        className={`flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-stage-text/85 transition-colors hover:bg-white/12 hover:text-stage-text sm:h-9 sm:px-2 ${
          open ? "bg-white/12 text-stage-text" : ""
        }`}
      >
        <IconSettings size={19} stroke={1.9} />
        {children}
      </button>

      {open && (stage ? createPortal(sheet, stage) : sheet)}
    </div>
  );
}
