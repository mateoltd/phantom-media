"use client";

import { type ReactNode, useState } from "react";
import Image from "next/image";

export interface ArtworkProps {
  src?: string | null;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Shown when there is no image, or when the one there is fails to load. */
  fallback?: ReactNode;
}

/**
 * A poster, still or backdrop that is allowed to be missing.
 *
 * Catalog artwork is served by a cache that redirects to an origin, and the
 * origin answers 404 for titles nobody has uploaded art for. Nothing upstream
 * says which those are, so the only way to know is to ask — and the only
 * decent way to handle the answer is to draw something else.
 */
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
