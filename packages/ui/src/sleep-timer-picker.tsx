"use client";

import { useCallback, useEffect, useRef } from "react";
import { Check, X } from "@phosphor-icons/react/ssr";
import { SLEEP_TIMER_OPTIONS } from "./use-sleep-timer";

interface SleepTimerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  minutes: number | null;
  minutesLeft: number;
  onChange: (minutes: number | null) => void;
}

function durationLabel(minutes: number) {
  return minutes === 60 ? "1 hour" : minutes === 120 ? "2 hours" : `${minutes} minutes`;
}

export function SleepTimerPicker({ open, onOpenChange, minutes, minutesLeft, onChange }: SleepTimerPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    const trigger = panelRef.current?.closest(".stage")?.querySelector<HTMLButtonElement>(".stage-sleep-trigger");
    onOpenChange(false);
    trigger?.focus({ preventScroll: true });
  }, [onOpenChange]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLButtonElement>("[aria-pressed=true]")?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!panelRef.current?.contains(target) && !target.closest(".stage-sleep-trigger")) close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [close, open]);

  if (!open) return null;
  const choose = (value: number | null) => { onChange(value); close(); };
  return <>
    <button type="button" className="stage-sheet-backdrop" aria-label="Dismiss sleep timer" onClick={close} />
    <div ref={panelRef} className="stage-sheet stage-sleep-sheet" role="dialog" aria-label="Sleep timer" onKeyDown={event => event.stopPropagation()}>
      <div className="stage-sheet-header"><span>Sleep timer</span><button type="button" className="stage-control" aria-label="Close sleep timer" onClick={close}><X size={18} /></button></div>
      <div className="stage-sheet-body">
        <p className="stage-sheet-note" role="status">{minutes === null ? "Pause playback after a set time." : `Playback pauses in ${minutesLeft} minutes.`}</p>
        <button type="button" className="stage-sheet-row stage-sleep-off" aria-pressed={minutes === null} onClick={() => choose(null)}><span>Off</span>{minutes === null && <Check size={16} />}</button>
        <div className="stage-sleep-options">{SLEEP_TIMER_OPTIONS.map(value => <button type="button" key={value} className="stage-sleep-choice" aria-pressed={minutes === value} aria-label={`Stop playback in ${durationLabel(value)}`} onClick={() => choose(value)}>{durationLabel(value)}{minutes === value && <Check size={14} />}</button>)}</div>
      </div>
    </div>
  </>;
}
