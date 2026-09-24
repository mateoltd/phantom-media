"use client";

import { useCallback, useState } from "react";
import { Check, ShareNetwork } from "@phosphor-icons/react/ssr";
import { Button } from "@phantom/ui";
import { buildVodPath } from "@/lib/validation";

interface ShareButtonProps {
  vodId: string;
  currentTime?: number;
  iconOnly?: boolean;
}

export function ShareButton({ vodId, currentTime, iconOnly = false }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const url = new URL(buildVodPath(vodId, currentTime), window.location.origin);

    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [vodId, currentTime]);

  return (
    <Button
      variant="secondary"
      onClick={handleCopy}
      aria-label={copied ? "Link copied" : "Share video"}
      data-copied={copied}
      className={`twitch-share-button ${iconOnly ? "twitch-rail-action" : "h-9 px-3 text-[11px]"} ${copied ? "text-success" : ""}`}
    >
      <span className="twitch-share-icon" data-copied={copied} aria-hidden="true">
        {copied ? (
          <Check weight="regular" size={iconOnly ? 21 : 12} />
        ) : (
          <ShareNetwork weight="regular" size={iconOnly ? 21 : 12} />
        )}
      </span>
      <span className={iconOnly ? "sr-only" : ""} role="status">{copied ? "Copied" : "Share"}</span>
    </Button>
  );
}
