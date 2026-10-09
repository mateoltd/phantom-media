"use client";

import { useImperativeHandle, useRef } from "react";
import type { Ref } from "react";
import { formatTimecode } from "./timecode";

export interface ScrubTooltipHandle {
  preview: (time: number, labels: readonly string[]) => void;
}

/** Keep pointer previews out of the React render loop, with structured labels rather than punctuation. */
export function ScrubTooltip({ ref }: { ref: Ref<ScrubTooltipHandle> }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const labelsRef = useRef<HTMLSpanElement>(null);
  const lastLabelsRef = useRef("");
  useImperativeHandle(ref, () => ({
    preview(time, labels) {
      const root = rootRef.current;
      const timeElement = timeRef.current;
      const labelsElement = labelsRef.current;
      if (!root || !timeElement || !labelsElement) return;
      let changed = false;
      const timecode = formatTimecode(time);
      if (timeElement.textContent !== timecode) {
        timeElement.textContent = timecode;
        changed = true;
      }
      const key = JSON.stringify(labels);
      if (key !== lastLabelsRef.current) {
        lastLabelsRef.current = key;
        labelsElement.replaceChildren(...labels.map((label) => {
          const element = document.createElement("span");
          element.textContent = label;
          return element;
        }));
        changed = true;
      }
      if (changed) root.style.setProperty("--tooltip-half-width", `${root.offsetWidth / 2}px`);
    },
  }), []);

  return <span ref={rootRef} className="scrub-tooltip" aria-hidden="true">
    <span ref={timeRef} className="scrub-tooltip-time" />
    <span ref={labelsRef} className="scrub-tooltip-labels" />
  </span>;
}
