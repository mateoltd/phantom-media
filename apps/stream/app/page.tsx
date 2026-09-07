import { AppHeader } from "@/components/app-header";
import { BrowseRail } from "@/components/browse-rail";
import { CinemaHero } from "@/components/cinema-hero";
import { SiteFooter } from "@/components/site-footer";
import { browseHome } from "@/lib/catalog";

export const revalidate = 3600;

export default async function Page() {
  const rows = await browseHome();
  // Lanterns' backdrop composition is unsuitable for the full-width hero.
  const featured = rows[0]?.items.find(
    (item) => item.imdbId !== "tt26545992" && item.id !== "tt26545992",
  );

  return (
    <main className="workspace-canvas flex min-h-screen flex-col">
      <AppHeader floating={Boolean(featured)} />

      {featured && <CinemaHero media={featured} />}

      <div className={featured ? "relative z-10 -mt-2 pb-12" : "flex-1 pb-12 pt-6"}>
        {rows.map((row, index) => (
          <BrowseRail
            key={row.id}
            row={{
              ...row,
              items:
                index === 0
                  ? row.items.filter((item) => item.id !== featured?.id)
                  : row.items,
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
              Browsing is unavailable right now. You can still search for a
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
