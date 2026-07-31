"use client";

import { type ReactNode, useState } from "react";
import Image from "next/image";

export interface ArtworkProps {
  src?: string | null;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  fallback?: ReactNode;
}

export function Artwork({
  src,
  alt = "",
  sizes,
  priority = false,
  className = "",
  fallback = null,
}: ArtworkProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <>{fallback}</>;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized
      priority={priority}
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
