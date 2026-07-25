"use client";

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

  return (
    <nav
      aria-label={t.language.label}
      className="locale-switcher flex items-center rounded-full border border-border bg-surface/75 p-1 text-[10px] font-bold text-text-secondary backdrop-blur-sm"
    >
      <a
        href={englishHref}
        hrefLang="en"
        aria-current={locale === "en" ? "page" : undefined}
        onClick={() => setPendingLocale("en")}
        className={`rounded-full px-2.5 py-1.5 ${
          visibleLocale === "en" ? "bg-text text-white" : "hover:text-text"
        }`}
      >
        EN
      </a>
      <a
        href={spanishHref}
        hrefLang="es"
        aria-current={locale === "es" ? "page" : undefined}
        onClick={() => setPendingLocale("es")}
        className={`rounded-full px-2.5 py-1.5 ${
          visibleLocale === "es" ? "bg-text text-white" : "hover:text-text"
        }`}
      >
        ES
      </a>
    </nav>
  );
}
