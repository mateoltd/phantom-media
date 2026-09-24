"use client";

import Link from "next/link";
import { useI18n } from "@/components/locale-provider";
import { localePath } from "@/lib/i18n";

type SiteFooterProps = {
  className?: string;
};

export function SiteFooter({ className = "" }: SiteFooterProps) {
  const { locale, messages: t } = useI18n();

  return (
    <footer className={className}>
      <div className="flex flex-col gap-2 border-t border-border/60 py-6 text-[11.5px] leading-5 text-text-tertiary sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <p>
          {t.footer.independent}{" "}
          <Link
            href={localePath(locale, "/disclaimer")}
            className="font-medium text-text-secondary underline decoration-text-tertiary/35 decoration-1 underline-offset-[3px] transition-colors hover:text-text hover:decoration-text/60"
          >
            {t.footer.disclaimer}
          </Link>
        </p>
        <p>{t.footer.use}</p>
      </div>
    </footer>
  );
}
