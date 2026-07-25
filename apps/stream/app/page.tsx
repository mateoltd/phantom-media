import { AppHeader } from "@/components/app-header";
import { BrowseRail } from "@/components/browse-rail";
import { CinemaHero } from "@/components/cinema-hero";
import { SiteFooter } from "@/components/site-footer";
import { browseHome } from "@/lib/catalog";

/** The listings move about as often as a day, and never per visitor. */
export const revalidate = 3600;

export default async function Page() {
  const rows = await browseHome();
  const featured = rows[0]?.items[0];

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      {/* Floating over the hero until the page moves: the artwork is the point
          of the first screen, and a solid bar across it is a lid. */}
      <AppHeader floating={Boolean(featured)} />

      {featured && <CinemaHero media={featured} />}

      <div className={featured ? "-mt-2 pb-12" : "flex-1 pb-12 pt-6"}>
        {rows.map((row, index) => (
          <BrowseRail
            key={row.id}
            row={{
              ...row,
              // The featured title is already the size of the screen above.
              items: index === 0 ? row.items.slice(1) : row.items,
            }}
            priority={index === 0}
          />
        ))}

        {rows.length === 0 && (
          <div className="app-shell py-24 text-center">
            <h1 className="text-xl font-extrabold text-text">
              The catalog is not answering
            </h1>
            <p className="mx-auto mt-3 max-w-sm text-[13px] leading-6 text-text-secondary">
              Browsing is unavailable right now. Search still works — type a
              title, an IMDb link or a TMDB id above.
            </p>
          </div>
        )}
      </div>

      <div className="app-shell mt-auto">
        <SiteFooter />
      </div>
    </main>
  );
}
