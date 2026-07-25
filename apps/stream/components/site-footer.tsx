import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Metadata sources are credited by name because attribution is owed. Playback
 * sources are not named anywhere in this app.
 *
 * The credit is a sentence rather than a table of field names: two words set
 * in tracked capitals next to two proper nouns, all at ten pixels, gave four
 * competing weights to read and no way to tell which were the links.
 */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={className}>
      <div className="flex flex-col gap-2 border-t border-border/60 py-6 text-[11.5px] leading-5 text-text-tertiary sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p>
          An independent project that hosts no media. Everything plays straight
          from third-party sources.{" "}
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
