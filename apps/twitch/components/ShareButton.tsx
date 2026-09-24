"use client";

import { useCallback, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@phantom/ui";
import { buildVodPath } from "@/lib/validation";

interface ShareButtonProps {
  vodId: string;
  currentTime?: number;
}

export function ShareButton({ vodId, currentTime }: ShareButtonProps) {
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
      className={`h-9 px-3 text-[11px] ${copied ? "text-success" : ""}`}
    >
      {copied ? (
        <Check size={12} strokeWidth={2.2} />
      ) : (
        <Share2 size={12} strokeWidth={2} />
      )}
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
