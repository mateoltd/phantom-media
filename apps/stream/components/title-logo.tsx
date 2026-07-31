"use client";

import { useState } from "react";
import Image from "next/image";
import type { MediaResult } from "@/lib/types";

interface TitleLogoProps {
  media: MediaResult;
  priority?: boolean;
  maxHeight: string;
  maxWidth: string;
  headingClassName: string;
}

export function TitleLogo({
  media,
  priority = false,
  maxHeight,
  maxWidth,
  headingClassName,
}: TitleLogoProps) {
  const [failed, setFailed] = useState(false);

  if (!media.logoUrl || failed) {
    return <h1 className={headingClassName}>{media.title}</h1>;
  }

  return (
    <h1>
      <Image
        src={media.logoUrl}
        alt={media.title}
        width={520}
        height={220}
        unoptimized
        priority={priority}
        onError={() => setFailed(true)}
        style={{ maxHeight, maxWidth: `min(100%, ${maxWidth})` }}
        className="h-auto w-auto object-contain object-left drop-shadow-[0_6px_24px_rgba(0,0,0,0.55)]"
      />
    </h1>
  );
}
