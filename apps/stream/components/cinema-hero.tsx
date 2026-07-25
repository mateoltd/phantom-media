import Image from "next/image";
import Link from "next/link";
import { IconInfoCircle, IconPlayerPlayFilled } from "@tabler/icons-react";
import { TitleMeta } from "@/components/title-meta";
import { mediaHref } from "@/lib/media";
import type { MediaResult } from "@/lib/types";

/**
 * The top of the home page: one title, its own backdrop, and its own logotype
 * where the catalog has one. A title's wordmark is the most recognisable thing
 * about it, so it is used in place of setting the name in ours.
 */
export function CinemaHero({ media }: { media: MediaResult }) {
  return (
    <section className="cinema-hero">
      {media.backdropUrl && (
        <Image
          src={media.backdropUrl}
          alt=""
          fill
          sizes="100vw"
          unoptimized
          priority
          className="cinema-hero-art"
        />
      )}
      <div className="cinema-hero-scrim" aria-hidden="true" />

      <div className="app-shell relative z-10 pb-14 pt-36 sm:pb-20">
        <div className="max-w-xl">
          {media.logoUrl ? (
            <Image
              src={media.logoUrl}
              alt={media.title}
              width={520}
              height={220}
              unoptimized
              priority
              className="h-auto max-h-[8.5rem] w-auto max-w-[min(100%,25rem)] object-contain object-left drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]"
            />
          ) : (
            <h1 className="text-[clamp(2rem,5vw,3.6rem)] font-extrabold leading-[0.95] tracking-[-0.03em] text-text">
              {media.title}
            </h1>
          )}

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
