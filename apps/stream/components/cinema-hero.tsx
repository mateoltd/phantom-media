import Link from "next/link";
import { IconInfoCircle, IconPlayerPlayFilled } from "@tabler/icons-react";
import { Artwork } from "@phantom/ui";
import { TitleLogo } from "@/components/title-logo";
import { TitleMeta } from "@/components/title-meta";
import { mediaHref } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

export function CinemaHero({ media }: { media: MediaResult }) {
  return (
    <section className="cinema-hero">
      <Artwork
        src={media.backdropUrl}
        sizes="100vw"
        priority
        className="cinema-hero-art"
      />
      <div className="cinema-hero-scrim" aria-hidden="true" />

      <div className="app-shell relative z-10 pb-12 pt-24 sm:pb-20 sm:pt-36">
        <div className="max-w-xl">
          <TitleLogo
            media={media}
            priority
            maxHeight="clamp(4rem, 16vw, 8.5rem)"
            maxWidth="25rem"
            headingClassName="text-[clamp(2rem,5vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-text"
          />

          <div className="mt-5">
            <TitleMeta media={media} tone="over-art" />
          </div>

          {media.overview && (
            <p className="mt-4 line-clamp-3 max-w-lg text-[13.5px] leading-6 text-text-secondary">
              {media.overview}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={mediaHref(media)}
              className="flex h-12 items-center gap-2 rounded-full bg-phantom px-6 text-sm font-extrabold text-white transition-colors hover:bg-phantom-dark"
            >
              <IconPlayerPlayFilled size={16} />
              Play
            </Link>
            <Link
              href={`${mediaHref(media)}#about`}
              className="flex h-12 items-center gap-2 rounded-full border border-border bg-surface/70 px-5 text-sm font-bold text-text backdrop-blur-sm transition-colors hover:border-text/35"
            >
              <IconInfoCircle size={17} stroke={2} />
              More info
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
