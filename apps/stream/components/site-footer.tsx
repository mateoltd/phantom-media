import type { ReactNode } from "react";
import Link from "next/link";

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={className}>
      <div className="flex flex-col gap-2 border-t border-border/60 py-6 text-[11.5px] leading-5 text-text-tertiary sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p>
          An independent project with no stored media library. Playback comes
          from public third-party sources, directly or through a constrained
          compatibility relay.{" "}
          <Link
            href="/disclaimer"
            className="font-medium text-text-secondary underline decoration-text-tertiary/35 decoration-1 underline-offset-[3px] transition-colors hover:text-text hover:decoration-text/60"
          >
            Legal disclaimer
          </Link>
        </p>
        <p>
          Metadata from <Credit href="https://www.stremio.com">Cinemeta</Credit>{" "}
          and <Credit href="https://www.wikidata.org">Wikidata</Credit>.
          Subtitles from{" "}
          <Credit href="https://www.opensubtitles.org">OpenSubtitles</Credit>
          {" "}and <Credit href="https://subdl.com">SubDL</Credit>
        </p>
      </div>
    </footer>
  );
}

function Credit({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-text-secondary underline decoration-text-tertiary/35 decoration-1 underline-offset-[3px] transition-colors hover:text-text hover:decoration-text/60"
    >
      {children}
    </a>
  );
}
