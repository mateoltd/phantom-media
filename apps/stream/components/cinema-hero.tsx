import Link from "next/link";
import { Info, Play } from "@phosphor-icons/react/ssr";
import { Artwork } from "@phantom/ui";
import { TitleLogo } from "@/components/title-logo";
import { TitleMeta } from "@/components/title-meta";
import { WatchlistButton } from "@/components/watchlist-button";
import { mediaHref } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

export function CinemaHero({ media }: { media: MediaResult }) {
  return (
    <section className="cinema-hero">
      <div className="cinema-hero-artwork" aria-hidden="true">
        <Artwork src={media.backdropUrl} sizes="100vw" priority className="cinema-hero-art" />
        <div className="cinema-hero-scrim" />
      </div>

      <div className="app-shell relative z-10">
        <div className="cinema-hero-copy max-w-xl">
          <TitleLogo
            media={media}
            priority
            maxHeight="clamp(3.5rem, 11svh, 6.5rem)"
            maxWidth="25rem"
            headingClassName="text-[clamp(2rem,5vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-text"
          />

          <div className="mt-5">
            <TitleMeta media={media} tone="over-art" />
          </div>

          {media.overview && (
            <p className="hero-overview mt-4 line-clamp-3 max-w-lg text-[13.5px] leading-6 text-text-secondary">
              {media.overview}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={mediaHref(media)}
              className="cinema-button cinema-button-primary"
            >
              <Play weight="fill" size={20} />
              Watch now
            </Link>
            <Link
              href={`${mediaHref(media)}#about`}
              className="cinema-button backdrop-blur-sm"
            >
              <Info weight="regular" size={17} />
              More info
            </Link>
            <WatchlistButton media={media} />
          </div>
        </div>
      </div>
    </section>
  );
}
