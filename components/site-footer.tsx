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
      <div className="flex flex-col items-center justify-between gap-2 border-t border-black/[0.07] py-5 text-[10px] text-text-tertiary sm:flex-row">
        <p>{t.footer.independent}</p>
        <p>
          {t.footer.use}{" "}
          <Link
            href={localePath(locale, "/disclaimer")}
            className="font-semibold text-text-secondary underline decoration-border underline-offset-4 transition-colors hover:text-text"
          >
            {t.footer.disclaimer}
          </Link>
        </p>
      </div>
    </footer>
  );
}
