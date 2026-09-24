"use client";

import { Translate } from "@phosphor-icons/react/ssr";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/locale-provider";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitcher({
  englishHref = "/",
  spanishHref = "/es",
}: {
  englishHref?: string;
  spanishHref?: string;
}) {
  const { locale, messages: t } = useI18n();
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const visibleLocale = pendingLocale ?? locale;

  useEffect(() => {
    const alternateHref = locale === "en" ? spanishHref : englishHref;
    const prefetch = document.createElement("link");
    prefetch.rel = "prefetch";
    prefetch.as = "document";
    prefetch.href = alternateHref;
    document.head.append(prefetch);
    return () => prefetch.remove();
  }, [englishHref, locale, spanishHref]);

  const changeLocale = (nextLocale: Locale) => {
    setPendingLocale(nextLocale);
    window.location.assign(nextLocale === "en" ? englishHref : spanishHref);
  };

  return (
    <label
      className="media-header-action locale-switcher relative focus-within:ring-2 focus-within:ring-white/40"
      title={`${t.language.label}: ${visibleLocale.toUpperCase()}`}
    >
      <Translate weight="regular" size={18} aria-hidden="true" />
      <select
        value={visibleLocale}
        onChange={(event) => changeLocale(event.target.value as Locale)}
        aria-label={t.language.label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
    </label>
  );
}
