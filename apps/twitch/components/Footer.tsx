import Link from "next/link";
import { PhantomSignature } from "./PhantomSignature";

export function Footer() {
  return (
    <footer className="twitch-footer py-5 text-center">
      <PhantomSignature />
      <p className="text-[11px] text-text-tertiary">
        Not affiliated with Twitch. For authorized use only.{" "}
        <Link href="/disclaimer" className="underline underline-offset-4 transition-colors hover:text-text">
          Legal disclaimer
        </Link>
      </p>
    </footer>
  );
}
