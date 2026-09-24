"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MediaHeader, Wordmark } from "@phantom/ui";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/locale-provider";
import { SearchBar } from "@/components/search-bar";
import { localePath } from "@/lib/i18n";
import type { VideoInfo } from "@/lib/types";

interface AppHeaderProps {
  onSearch?: (query: string) => void;
  onSelectVideo?: (video: VideoInfo) => void;
  loading?: boolean;
  placeholder?: string;
  floating?: boolean;
  initialQuery?: string;
  englishHref?: string;
  spanishHref?: string;
}

export function AppHeader({
  onSearch,
  onSelectVideo,
  loading = false,
  placeholder,
  floating = false,
  initialQuery = "",
  englishHref,
  spanishHref,
}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, messages: t } = useI18n();

  const handleSearch = (query: string) => {
    if (onSearch) {
      onSearch(query);
      return;
    }
    router.push(localePath(locale, `/search?q=${encodeURIComponent(query)}`));
  };

  const handleSelectVideo = (video: VideoInfo) => {
    if (onSelectVideo) {
      onSelectVideo(video);
      return;
    }
    router.push(localePath(locale, `/watch?v=${encodeURIComponent(video.id)}`));
  };

  return (
    <MediaHeader
      routeKey={pathname}
      floating={floating}
      labels={{
        openSearch: t.search.openSearch,
        closeSearch: t.search.closeSearch,
      }}
      brand={
        <Link href={localePath(locale, "/")} aria-label={t.nav.home}>
          <Wordmark
            service="Downloader"
            tone="chalk"
            priority
            className="hidden sm:flex"
          />
          <Wordmark tone="chalk" priority className="sm:hidden" />
        </Link>
      }
      search={
        <SearchBar
          onSubmit={handleSearch}
          onSelectVideo={handleSelectVideo}
          loading={loading}
          placeholder={placeholder}
          initialValue={initialQuery}
          size="compact"
        />
      }
      actions={
        <LanguageSwitcher
          englishHref={englishHref}
          spanishHref={spanishHref}
        />
      }
    />
  );
}
