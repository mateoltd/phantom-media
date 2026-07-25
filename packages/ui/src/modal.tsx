"use client";

import type { ReactNode } from "react";
import { useModalBehavior } from "./use-modal-behavior";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** id of the element naming the dialog, usually its heading. */
  labelledBy: string;
  /** Tailwind width class for the panel, e.g. `max-w-2xl`. */
  width?: string;
  /**
   * Height classes applied to the panel. Pass a fixed height for panels whose
   * content would otherwise grow with the number of options, and leave it off
   * for panels that should size to what they are showing.
   */
  height?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Every Phantom dialog: a scrim that closes on a backdrop press, a panel that
 * rises from the bottom edge on phones and centres on wider screens, page
 * scroll locked while it is open, and Escape wired to `onClose`.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  width = "max-w-[520px]",
  height = "",
  className = "",
  children,
}: ModalProps) {
  useModalBehavior(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`panel-soft flex w-full flex-col overflow-hidden rounded-t-[24px] animate-slide-up sm:rounded-[24px] ${width} ${height} ${className}`}
      >
        {children}
      </section>
    </div>
  );
}
