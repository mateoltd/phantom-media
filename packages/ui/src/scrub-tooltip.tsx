"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import type { ReactNode, Ref } from "react";
import { formatTimecode } from "./timecode";
import type { PlaybackSegment } from "./playback-segments";
import { SpeakerSlash } from "@phosphor-icons/react/ssr";

export interface ScrubTooltipHandle {
  preview: (time: number, segments: readonly PlaybackSegment[]) => void;
}

/** Keep pointer previews out of the React render loop, with structured labels rather than punctuation. */
export function ScrubTooltip({ ref, children }: { ref: Ref<ScrubTooltipHandle>; children?: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const labelsRef = useRef<HTMLSpanElement>(null);
  const mutedRef = useRef<HTMLSpanElement>(null);
  const lastLabelsRef = useRef("");
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--tooltip-half-width", `${root.offsetWidth / 2}px`);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useImperativeHandle(ref, () => ({
    preview(time, segments) {
      const root = rootRef.current;
      const timeElement = timeRef.current;
      const labelsElement = labelsRef.current;
      const mutedElement = mutedRef.current;
      if (!root || !timeElement || !labelsElement || !mutedElement) return;
      let changed = false;
      const timecode = formatTimecode(time);
      if (timeElement.textContent !== timecode) {
        timeElement.textContent = timecode;
        changed = true;
      }
      const isMuted = segments.some(segment => segment.kind === "muted");
      if (mutedElement.hidden === isMuted) {
        mutedElement.hidden = !isMuted;
        changed = true;
      }
      const labels = [...new Map(segments.filter(segment => segment.kind !== "muted").map(({ kind, label }) => [JSON.stringify([kind, label]), { kind, label }])).values()];
      const key = JSON.stringify(labels);
      if (key !== lastLabelsRef.current) {
        lastLabelsRef.current = key;
        labelsElement.replaceChildren(...labels.map(({ kind, label }) => {
          const element = document.createElement("span");
          element.textContent = label;
          element.title = label;
          element.dataset.kind = kind;
          return element;
        }));
        changed = true;
      }
      if (changed) root.style.setProperty("--tooltip-half-width", `${root.offsetWidth / 2}px`);
    },
  }), []);

  return <div ref={rootRef} className="scrub-tooltip" data-preview={children ? true : undefined} aria-hidden="true">
    {children}
    <div className="scrub-tooltip-meta">
      <span ref={timeRef} className="scrub-tooltip-time" />
      <span ref={labelsRef} className="scrub-tooltip-labels" />
      <span ref={mutedRef} className="scrub-tooltip-muted" hidden title="Muted audio"><SpeakerSlash size={15} /></span>
    </div>
  </div>;
}
