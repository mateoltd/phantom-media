import { PosterTile } from "@/components/poster-tile";
import type { BrowseRow } from "@/lib/catalog";

export function BrowseRail({
  row,
  priority = false,
}: {
  row: BrowseRow;
  priority?: boolean;
}) {
  return (
    <section className="pt-7">
      <h2 className="app-shell text-[15px] font-extrabold tracking-[-0.01em] text-text sm:text-[17px]">
        {row.title}
      </h2>

      <div className="rail-edges">
        <div className="rail">
          {row.items.map((media, index) => (
            <PosterTile
              key={`${media.mediaType}-${media.id}`}
              media={media}
              priority={priority && index < 6}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
