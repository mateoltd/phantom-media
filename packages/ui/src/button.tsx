"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";

type NativeButton = ComponentPropsWithRef<"button">;

const VARIANTS = {
  primary:
    "bg-phantom px-5 text-[var(--button-primary-text,#fff)] hover:bg-phantom-dark disabled:cursor-not-allowed disabled:bg-transparent disabled:text-text-tertiary disabled:shadow-[inset_0_0_0_1px_var(--color-border)]",
  ghost:
    "px-4 text-text-secondary hover:bg-surface-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "bg-surface-light px-4 text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50",
  outline:
    "border border-border bg-surface px-4 text-text hover:border-text/30 disabled:cursor-not-allowed disabled:opacity-50",
} as const;

export interface ButtonProps extends NativeButton {
  variant?: keyof typeof VARIANTS;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-phantom-button={variant}
      className={`flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl text-[13px] font-bold transition-colors ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const ICON_SIZES = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-11 w-11",
} as const;

export interface IconButtonProps extends NativeButton {
  label: string;
  children: ReactNode;
  size?: keyof typeof ICON_SIZES;
}

export function IconButton({
  label,
  size = "md",
  className = "",
  type = "button",
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`flex ${ICON_SIZES[size]} shrink-0 items-center justify-center rounded-xl text-text-tertiary transition-colors hover:bg-bg hover:text-text disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
