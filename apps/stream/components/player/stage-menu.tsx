"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconCheck } from "@tabler/icons-react";

export interface StageMenuOption {
  value: string;
  label: string;
  detail?: string;
}

interface StageMenuProps {
  label: string;
  icon: ReactNode;
  /** Printed beside the icon when there is room. */
  summary?: string;
  options: readonly StageMenuOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  /** The chrome has to stay up while a menu is open over it. */
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

/**
 * The player's own menu. It is not the app's `StyledSelect` because that one
 * is a labelled form control on paper; this is a compact dark popover that
 * lives inside the video chrome and must stay within the fullscreen element.
 */
export function StageMenu({
  label,
  icon,
  summary,
  options,
  value,
  onValueChange,
  onOpenChange,
  disabled = false,
}: StageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
    if (!open) return;

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [onOpenChange, open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-stage-text/85 transition-colors hover:bg-white/12 hover:text-stage-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        {icon}
        {summary && (
          <span className="hidden font-mono text-[11px] font-bold sm:inline">
            {summary}
          </span>
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute bottom-[calc(100%+0.5rem)] right-0 z-20 max-h-64 w-56 overflow-y-auto overscroll-contain rounded-xl border border-stage-line bg-stage-raised/98 p-1 shadow-[0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? "bg-white/10 text-stage-text"
                    : "text-stage-muted hover:bg-white/8 hover:text-stage-text"
                }`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {selected && <IconCheck size={13} stroke={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold">
                    {option.label}
                  </span>
                  {option.detail && (
                    <span className="mt-0.5 block truncate text-[10px] text-stage-muted">
                      {option.detail}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
