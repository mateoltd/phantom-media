"use client";

import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
  decorative?: boolean;
  priority?: boolean;
}

export function Logo({
  size = 40,
  className = "",
  decorative = false,
  priority = false,
}: LogoProps) {
  return (
    <Image
      src="/phantom-mark-v2.png"
      width={Math.round(size * (723 / 398))}
      height={size}
      alt={decorative ? "" : "Phantom"}
      aria-hidden={decorative || undefined}
      priority={priority}
      className={className}
    />
  );
}
