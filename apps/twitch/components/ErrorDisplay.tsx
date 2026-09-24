import { TriangleAlert, ArrowRight } from "lucide-react";
import { Button } from "@phantom/ui";

interface ErrorDisplayProps {
  message: string;
  onRetry: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  const isH265 = /hev1|h\.265|hevc/i.test(message);

  return (
    <div className="mx-auto mt-16 max-w-md animate-slide-up text-center sm:mt-20">
      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-error/10 text-error">
        <TriangleAlert size={20} strokeWidth={1.8} />
      </div>

      <p className="text-[15px] font-semibold tracking-tight text-text">
        {message}
      </p>

      {isH265 && (
        <p className="mt-2 text-[13px] leading-relaxed text-text-tertiary">
          This VOD uses H.265/HEVC encoding which your browser may not
          support. Try a Chromium-based browser with HEVC support.
        </p>
      )}

      <Button onClick={onRetry} className="mx-auto mt-5">
        Try again
        <ArrowRight size={14} strokeWidth={2.5} />
      </Button>
    </div>
  );
}
