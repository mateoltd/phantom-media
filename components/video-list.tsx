"use client";

import type { VideoInfo } from "@/lib/types";
import { useI18n } from "@/components/locale-provider";
import { VideoCard } from "./video-card";

interface VideoListProps {
  videos: VideoInfo[];
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (video: VideoInfo) => void;
  onVideoClick?: (video: VideoInfo) => void;
}

export function VideoList({
  videos,
  selectable,
  selectedIds,
  onToggleSelect,
  onVideoClick,
}: VideoListProps) {
  const { messages: t } = useI18n();

  if (videos.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-bold text-text">{t.results.empty}</p>
        <p className="mt-1 text-[12px] text-text-tertiary">
          {t.results.emptyHelp}
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        selectable
          ? "divide-y divide-black/[0.07]"
          : "grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      }
    >
      {videos.map((video, index) => (
        <VideoCard
          key={video.id}
          video={video}
          selectable={selectable}
          selected={selectedIds?.has(video.id)}
          onSelect={onToggleSelect}
          onClick={onVideoClick}
          style={
            selectable
              ? undefined
              : { animationDelay: `${0.03 * Math.min(index, 10)}s` }
          }
        />
      ))}
    </div>
  );
}
