const CREDITS = [
  { label: "Catalog", name: "Cinemeta", href: "https://www.stremio.com" },
  { label: "Identifiers", name: "Wikidata", href: "https://www.wikidata.org" },
] as const;

/**
 * Metadata sources are credited by name because attribution is owed. Playback
 * sources are not named anywhere in this app.
 */
export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={className}>
      <div className="flex flex-col items-start justify-between gap-3 border-t border-border py-5 text-[10px] text-text-tertiary sm:flex-row sm:items-center">
        <p>Phantom Stream is an independent project. No account, no tracking.</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {CREDITS.map((credit) => (
            <li key={credit.name}>
              <span className="font-semibold uppercase tracking-[0.1em]">{credit.label}</span>{" "}
              <a
                href={credit.href}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-text-secondary underline decoration-border underline-offset-4 transition-colors hover:text-text"
              >
                {credit.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
