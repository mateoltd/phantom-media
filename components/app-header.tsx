"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/components/locale-provider";
import { Logo } from "@/components/Logo";
import { SearchBar } from "@/components/search-bar";
import { localePath } from "@/lib/i18n";
import type { VideoInfo } from "@/lib/types";

interface AppHeaderProps {
  onSearch?: (query: string) => void;
  onSelectVideo?: (video: VideoInfo) => void;
  loading?: boolean;
  placeholder?: string;
  hideBrandOnDesktop?: boolean;
  englishHref?: string;
  spanishHref?: string;
}

export function AppHeader({
  onSearch,
  onSelectVideo,
  loading = false,
  placeholder,
  hideBrandOnDesktop = false,
  englishHref,
  spanishHref,
}: AppHeaderProps) {
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
    <header className="app-shell relative z-30 flex flex-wrap items-center gap-x-5 gap-y-3 pb-4 pt-5 lg:grid lg:grid-cols-[1fr_minmax(0,900px)_1fr]">
      <Link
        href={localePath(locale, "/")}
        aria-label={t.nav.home}
        className={`flex shrink-0 items-center gap-2.5 ${
          hideBrandOnDesktop ? "lg:hidden" : ""
        }`}
      >
        <Logo size={34} decorative priority className="h-6 w-auto" />
        <span className="text-xl font-extrabold leading-none text-text">
          Phantom
        </span>
      </Link>

      <div className="order-last w-full min-w-0 lg:order-none lg:col-start-2 lg:w-auto">
        <SearchBar
          onSubmit={handleSearch}
          onSelectVideo={handleSelectVideo}
          loading={loading}
          placeholder={placeholder}
        />
      </div>

      <div className="ml-auto shrink-0 lg:justify-self-end">
        <LanguageSwitcher englishHref={englishHref} spanishHref={spanishHref} />
      </div>
    </header>
  );
}
