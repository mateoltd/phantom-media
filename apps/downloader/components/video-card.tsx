"use client";

import Link from "next/link";
import { Check, DownloadSimple } from "@phosphor-icons/react/ssr";
import { Artwork, MediaTile } from "@phantom/ui";
import type { VideoInfo } from "@/lib/types";
import { formatDuration } from "@/lib/types";
import { useI18n } from "@/components/locale-provider";
import { localePath } from "@/lib/i18n";
import { prefetchStreamOptions } from "@/hooks/use-youtube";

interface VideoCardProps {
  video: VideoInfo;
  selected?: boolean;
  selectable?: boolean;
  onSelect?: (video: VideoInfo) => void;
  onClick?: (video: VideoInfo) => void;
  style?: React.CSSProperties;
}

export function VideoCard({
  video,
  selected,
  selectable,
  onSelect,
  onClick,
  style,
}: VideoCardProps) {
  const { locale, messages: t } = useI18n();

  if (selectable) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        className={`group flex w-full items-center gap-3 px-2 py-2.5 text-left transition-colors ${
          selected ? "bg-phantom-soft/50" : "hover:bg-surface-hover"
        }`}
        style={style}
        onClick={() => onSelect?.(video)}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            selected
              ? "border-phantom bg-phantom text-white"
              : "border-border bg-surface"
          }`}
        >
          {selected && <Check weight="regular" size={12} />}
        </span>
        <span className="relative h-12 w-[84px] shrink-0 overflow-hidden rounded-lg bg-surface-light">
          <Artwork
            src={video.thumbnailUrl}
            sizes="84px"
            fallback={
              <span className="flex h-full items-center justify-center text-sm font-bold text-text-tertiary">
                {video.title.slice(0, 1)}
              </span>
            }
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-xs font-bold leading-[18px] text-text">
            {video.title}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-text-tertiary">
            {video.author}
          </span>
        </span>
      </button>
    );
  }

  return (
    <article className="stagger-child min-w-0" style={style}>
      <Link
        href={localePath(locale, `/watch?v=${encodeURIComponent(video.id)}`)}
        aria-label={video.title}
        onClick={(event) => {
          if (!onClick) return;
          event.preventDefault();
          onClick(video);
        }}
        onPointerEnter={() => prefetchStreamOptions(video.id)}
        onPointerDown={() => prefetchStreamOptions(video.id)}
        onFocus={() => prefetchStreamOptions(video.id)}
        className="media-tile-hit group block min-w-0"
      >
        <MediaTile
          title={video.title}
          titleLines={2}
          imageUrl={video.thumbnailUrl}
          meta={
            <>
              <span>{video.author}</span>
              {video.viewCount !== undefined && (
                <span>
                  {formatCompactViews(video.viewCount, locale)} {t.results.views}
                </span>
              )}
            </>
          }
          badge={video.duration > 0 ? formatDuration(video.duration) : undefined}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          overlay={<DownloadSimple weight="regular" size={26} />}
        />
      </Link>
    </article>
  );
}

function formatCompactViews(views: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(views);
}
