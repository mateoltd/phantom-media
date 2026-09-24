"use client";

import type { ButtonHTMLAttributes } from "react";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, onCheckedChange, className = "", disabled, ...props }: SwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-phantom" : "bg-surface-light"} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`block h-3.5 w-3.5 rounded-full transition-transform ${checked ? "translate-x-[18px] bg-bg" : "translate-x-0.5 bg-text-secondary"}`}
      />
    </button>
  );
}
