import { SealCheck } from "@phosphor-icons/react/ssr";

/** Twitch marks partnered channels as verified. One mark, wherever a channel is named. */
export function VerifiedBadge({ size = 16 }: { size?: number }) {
  return <SealCheck weight="fill" size={size} role="img" aria-label="Verified" className="still-verified" />;
}
