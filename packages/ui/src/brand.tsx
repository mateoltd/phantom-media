"use client";

import Image from "next/image";

/** Intrinsic proportions of the Phantom mark. */
const MARK_RATIO = 723 / 398;

export interface LogoProps {
  size?: number;
  className?: string;
  decorative?: boolean;
  priority?: boolean;
  src?: string;
}

export function Logo({
  size = 40,
  className = "",
  decorative = false,
  priority = false,
  src = "/phantom-mark-v2.png",
}: LogoProps) {
  return (
    <Image
      src={src}
      width={Math.round(size * MARK_RATIO)}
      height={size}
      alt={decorative ? "" : "Phantom"}
      aria-hidden={decorative || undefined}
      preload={priority}
      fetchPriority={priority ? "high" : undefined}
      className={className}
    />
  );
}

export interface WordmarkProps {
  /** The service name printed after "Phantom", e.g. "Stream". */
  service?: string;
  className?: string;
  priority?: boolean;
}

/**
 * Mark plus name. Every Phantom app wears the same wordmark and distinguishes
 * itself only by the service word set in mono beside it.
 */
export function Wordmark({
  service,
  className = "",
  priority = false,
}: WordmarkProps) {
  return (
    <span className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <Logo size={34} decorative priority={priority} className="h-6 w-auto" />
      <span className="flex items-baseline gap-1.5">
        <span className="text-xl font-extrabold leading-none text-text">
          Phantom
        </span>
        {service && (
          <span className="font-mono text-[10px] font-bold uppercase leading-none text-text-tertiary">
            {service}
          </span>
        )}
      </span>
    </span>
  );
}
