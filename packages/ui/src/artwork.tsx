"use client";

import { type ReactNode, useState } from "react";
import Image from "next/image";

export interface ArtworkProps {
  src?: string | null;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
  className?: string;
  fallback?: ReactNode;
}

export function Artwork({
  src,
  alt = "",
  sizes,
  priority = false,
  loading,
  decoding,
  className = "",
  fallback = null,
}: ArtworkProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized
      priority={priority}
      loading={loading}
      decoding={decoding}
      onError={() => setFailedSrc(src)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
