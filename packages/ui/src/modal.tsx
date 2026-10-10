"use client";

import { type ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useModalBehavior } from "./use-modal-behavior";

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

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
  const dialog = useRef<HTMLElement>(null);
  const mounted = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  useEffect(() => {
    if (!open || !mounted || !dialog.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    const focusable = () => [...element.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']")].filter(node => node.getClientRects().length > 0);
    (focusable()[0] ?? element).focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0] ?? element, last = items.at(-1) ?? element;
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last || !element.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus(); };
  }, [open, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`panel-soft flex w-full flex-col overflow-hidden rounded-t-[24px] animate-slide-up sm:rounded-[24px] ${width} ${height} ${className}`}
      >
        {children}
      </section>
    </div>, document.body
  );
}
