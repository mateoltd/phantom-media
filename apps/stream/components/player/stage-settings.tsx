"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck, IconSettings } from "@tabler/icons-react";

export interface SettingsOption {
  value: string;
  label: string;
  detail?: string;
}

export interface SettingsSection {
  id: string;
  /** Tab label. Kept to one word so four fit across the sheet. */
  title: string;
  options: readonly SettingsOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Shown above the list when the choice needs a sentence of context. */
  note?: string;
  empty?: string;
}

interface StageSettingsProps {
  sections: readonly SettingsSection[];
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

/**
 * One sheet for everything about how a title is being played.
 *
 * Quality, speed, subtitles and source were four popovers in a row, each
 * behind an icon that looked like the others, and the source roster in
 * particular is a fourteen-row list nobody could tell was a list until they
 * opened it. Tabs give each of them a name and cost one click that the wall of
 * glyphs was charging anyway in the time spent working out which was which.
 */
export function StageSettings({
  sections,
  onOpenChange,
  children,
}: StageSettingsProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const rootRef = useRef<HTMLDivElement>(null);

  const section = sections.find((entry) => entry.id === active) ?? sections[0];

  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) change(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Otherwise this also leaves fullscreen, which is never what closing a
      // menu is meant to do.
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => change(!open)}
        aria-label="Settings"
        title="Settings"
        aria-expanded={open}
        className={`flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-stage-text/85 transition-colors hover:bg-white/12 hover:text-stage-text ${
          open ? "bg-white/12 text-stage-text" : ""
        }`}
      >
        <IconSettings size={19} stroke={1.9} />
        {children}
      </button>

      {open && (
        <div className="stage-sheet" role="dialog" aria-label="Playback settings">
          {sections.length > 1 && (
            <div className="stage-sheet-tabs" role="tablist">
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
            {section?.note && (
              <p className="stage-sheet-heading eyebrow">{section.note}</p>
            )}

            {section?.options.length === 0 && (
              <p className="px-2 py-6 text-center text-[12px] text-stage-muted">
                {section.empty ?? "Nothing to choose from"}
              </p>
            )}

            {section?.options.map((option) => {
              const selected = option.value === section.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => section.onChange(option.value)}
                  className="stage-sheet-row"
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
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
