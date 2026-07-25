"use client";

import Image from "next/image";
import Link from "next/link";
import { IconCheck, IconDownload } from "@tabler/icons-react";
import type { VideoInfo } from "@/lib/types";
import { formatDuration } from "@/lib/types";
import { useI18n } from "@/components/locale-provider";
import { localePath } from "@/lib/i18n";

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
          selected ? "bg-phantom-soft/50" : "hover:bg-bg"
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
          {selected && <IconCheck size={12} stroke={3} />}
        </span>
        <span className="relative h-12 w-[84px] shrink-0 overflow-hidden rounded-lg bg-[#ded9cf]">
          <Image
            src={video.thumbnailUrl}
            alt=""
            fill
            sizes="84px"
            unoptimized
            className="h-full w-full object-cover"
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
    <article className="stagger-child group min-w-0" style={style}>
      <Link
        href={localePath(locale, `/watch?v=${encodeURIComponent(video.id)}`)}
        onClick={(event) => {
          if (!onClick) return;
          event.preventDefault();
          onClick(video);
        }}
        className="block"
      >
        <span className="relative block aspect-video w-full overflow-hidden rounded-2xl border border-border bg-[#ded9cf]">
          <Image
            src={video.thumbnailUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            unoptimized
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
          <span className="absolute right-2.5 top-2.5 flex h-9 w-9 translate-y-1 items-center justify-center rounded-xl bg-phantom text-white opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            <IconDownload size={16} stroke={2.2} />
          </span>
          {video.duration > 0 && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
              {formatDuration(video.duration)}
            </span>
          )}
        </span>

        <h3 className="mt-3 line-clamp-2 text-[13.5px] font-bold leading-5 text-text decoration-phantom decoration-2 underline-offset-4 group-hover:underline">
          {video.title}
        </h3>
        <p className="mt-1.5 truncate text-[11px] font-medium text-text-secondary">
          {video.author}
        </p>
        {video.viewCount !== undefined && (
          <p className="mt-0.5 font-mono text-[10px] text-text-tertiary">
            {formatCompactViews(video.viewCount, locale)} {t.results.views}
          </p>
        )}
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
