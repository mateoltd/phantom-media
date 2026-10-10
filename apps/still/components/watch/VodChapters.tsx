"use client";

import { Button } from "@phantom/ui";
import type { Chapter } from "@/lib/contracts";
import { formatTime } from "@/lib/format";

export function VodChapters({ chapters, time, onSeek }: {
  chapters: readonly Chapter[]; time: number; onSeek: (position: number) => void;
}) {
  if (!chapters.length) return null;
  return <section className="still-vod-chapters" aria-label="Video chapters">
    <h2>Chapters</h2>
    <nav aria-label="Seek to chapter">{chapters.map(chapter => <Button key={chapter.id} variant="ghost" className="still-vod-chapter" aria-current={time >= chapter.start && time < chapter.end ? "true" : undefined} onClick={() => onSeek(chapter.start)}>
      <time>{formatTime(chapter.start)}</time><span>{chapter.title}</span>
    </Button>)}</nav>
  </section>;
}
