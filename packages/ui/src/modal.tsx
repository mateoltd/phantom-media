"use client";

import type { ReactNode } from "react";
import { useModalBehavior } from "./use-modal-behavior";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  width?: string;
  height?: string;
  className?: string;
  children: ReactNode;
}

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
