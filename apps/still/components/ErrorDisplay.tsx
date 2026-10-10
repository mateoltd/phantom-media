import { ArrowRight, Warning } from "@phosphor-icons/react/ssr";
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
        <Warning weight="regular" size={20} />
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
        <ArrowRight weight="regular" size={14} />
      </Button>
    </div>
  );
}
