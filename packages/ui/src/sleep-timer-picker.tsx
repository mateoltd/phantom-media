"use client";

import { useCallback, useEffect, useRef } from "react";
import { Liquid } from "liquid-gooey";
import { Timer, X } from "@phosphor-icons/react/ssr";

const FILLED_ICON = { weight: "fill" as const };

interface SleepTimerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minutes: number | null;
  minutesLeft: number;
  onChange: (minutes: number | null) => void;
}

const CHOICES = [
  { minutes: null, label: "Off", short: "Off", x: -108, y: -36 },
  { minutes: 15, label: "15 minutes", short: "15m", x: -36, y: -36 },
  { minutes: 30, label: "30 minutes", short: "30m", x: 36, y: -36 },
  { minutes: 45, label: "45 minutes", short: "45m", x: 108, y: -36 },
  { minutes: 60, label: "1 hour", short: "1h", x: -72, y: 36 },
  { minutes: 90, label: "90 minutes", short: "90m", x: 0, y: 36 },
  { minutes: 120, label: "2 hours", short: "2h", x: 72, y: 36 },
] as const;

export function SleepTimerPicker({
  open,
  onOpenChange,
  minutes,
  minutesLeft,
  onChange,
}: SleepTimerPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    onOpenChange(false);
    panelRef.current?.closest(".stage")?.querySelector<HTMLButtonElement>(".stage-sleep-trigger")?.focus({ preventScroll: true });
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]")?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, open]);

  return (
    <>
      {open && (
        <button
          type="button"
          className="stage-sleep-backdrop"
          aria-label="Close sleep timer"
          onClick={close}
        />
      )}
      <div
        ref={panelRef}
        className="stage-sleep-sheet"
        data-open={open}
        inert={!open}
        role="dialog"
        aria-label="Sleep timer"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="stage-sleep-header">
          <div className="stage-sleep-title">
            <Timer {...FILLED_ICON} size={18} aria-hidden="true" />
            <span>Sleep timer</span>
          </div>
          <span className="stage-sleep-remaining" aria-live="polite">
            {minutes === null ? "Off" : `${minutesLeft} min left`}
          </span>
          <button
            type="button"
            className="stage-control"
            aria-label="Close sleep timer"
            onClick={close}
          >
            <X weight="regular" size={18} />
          </button>
        </div>
        <Liquid className="stage-sleep-liquid" fill="#383b40" blur={10} contrast={18} shadow="0 4px 12px #0004">
          {CHOICES.map((choice, index) => {
            const selected = minutes === choice.minutes;
            const Icon = Timer;
            return (
              <Liquid.Item
                key={choice.short}
                className="stage-sleep-liquid-item"
                x={open ? choice.x : 0}
                y={open ? choice.y : 0}
                transition="bouncy"
                delay={index * 20}
              >
                <button
                  type="button"
                  className="stage-sleep-choice"
                  aria-label={choice.minutes === null ? "Turn off sleep timer" : `Stop playback in ${choice.label}`}
                  aria-pressed={selected}
                  title={choice.minutes === null ? "Off" : choice.label}
                  onClick={() => {
                    onChange(choice.minutes);
                    close();
                  }}
                >
                  <Icon {...FILLED_ICON} size={17} aria-hidden="true" />
                  <span>{choice.short}</span>
                </button>
              </Liquid.Item>
            );
          })}
        </Liquid>
      </div>
    </>
  );
}
