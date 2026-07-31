"use client";

import Image from "next/image";

const MARK_RATIO = 723 / 398;

const MARK_SRC = {
  ink: "/phantom-mark-v2.png",
  chalk: "/phantom-mark-chalk.png",
} as const;

export type MarkTone = keyof typeof MARK_SRC;

export interface LogoProps {
  size?: number;
  className?: string;
  decorative?: boolean;
  priority?: boolean;
  tone?: MarkTone;
  src?: string;
}

export function Logo({
  size = 40,
  className = "",
  decorative = false,
  priority = false,
  tone = "ink",
  src = MARK_SRC[tone],
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
  service?: string;
  className?: string;
  priority?: boolean;
  tone?: MarkTone;
}

export function Wordmark({
  service,
  className = "",
  priority = false,
  tone = "ink",
}: WordmarkProps) {
  return (
    <span className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <Logo
        size={34}
        decorative
        priority={priority}
        tone={tone}
        className="h-6 w-auto"
      />
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
