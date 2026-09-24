"use client";

import {
  CheckCircle,
  DownloadSimple,
  Lightning,
  LinkSimple,
} from "@phosphor-icons/react/ssr";
import { Button } from "@phantom/ui";
import { AppHeader } from "@/components/app-header";
import { useI18n } from "@/components/locale-provider";
import { SiteFooter } from "@/components/site-footer";

export default function HomePageClient() {
  return (
    <main className="media-home">
      <AppHeader floating />
      <Hero />
      <div className="app-shell relative z-10 media-home-bottom">
        <HomeDetails />
        <SiteFooter />
      </div>
    </main>
  );
}

function Hero() {
  const { messages: t } = useI18n();

  return (
    <section className="media-home-hero">
      <div className="media-home-artwork" aria-hidden="true">
        <div className="media-home-scrim" />
      </div>
      <div className="app-shell relative z-10">
        <div className="max-w-2xl animate-fade-in">
          <h1 className="text-[clamp(1.9rem,3.2vw,2.8rem)] font-semibold leading-[1.12] tracking-tight text-text">
            {t.home.headlineTop} {t.home.headlineBottom}
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-text-secondary">
            {t.home.promise}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              onClick={focusSearch}
              className="cinema-button cinema-button-primary"
            >
              {t.home.searchAction}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                document
                  .getElementById("downloader-formats")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              className="cinema-button"
            >
              {t.home.formatsAction}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function focusSearch() {
  const input = document.querySelector<HTMLInputElement>("header input");
  if (input?.getClientRects().length) input.focus();
  else document.querySelector<HTMLButtonElement>("[data-open-search]")?.click();
}

function WorkflowStep({
  icon,
  title,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "neutral" | "active" | "complete";
}) {
  const { messages: t } = useI18n();

  return (
    <article className="flex min-w-0 items-start gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          tone === "active"
            ? "bg-phantom/15 text-phantom"
            : tone === "complete"
              ? "bg-success/15 text-success"
              : "bg-surface-light text-text-secondary"
        }`}
      >
        {tone === "complete" ? (
          <CheckCircle weight="fill" size={20} aria-label={t.home.complete} />
        ) : (
          icon
        )}
      </span>
      <p className="pt-2 text-sm font-semibold text-text">{title}</p>
    </article>
  );
}

function HomeDetails() {
  const { messages: t } = useI18n();

  return (
    <section
      id="downloader-formats"
      className="scroll-mt-24 pb-10 pt-7 sm:pb-12 sm:pt-9"
    >
      <h2 className="text-xl font-semibold tracking-tight text-text">
        {t.home.howItWorks}
      </h2>

      <div className="mt-7 grid gap-x-6 gap-y-5 sm:grid-cols-3">
        <WorkflowStep
          icon={<LinkSimple weight="regular" size={20} />}
          title={t.home.desktopSteps[0]}
          tone="neutral"
        />
        <WorkflowStep
          icon={<Lightning weight="fill" size={21} />}
          title={t.home.desktopSteps[1]}
          tone="active"
        />
        <WorkflowStep
          icon={<DownloadSimple weight="regular" size={20} />}
          title={t.home.desktopSteps[2]}
          tone="complete"
        />
      </div>

      <div className="mt-12 grid gap-x-8 gap-y-8 md:grid-cols-3">
        <Column title={t.home.accepts.title}>
          <ul className="flex flex-wrap gap-1.5">
            {t.home.accepts.items.map((item) => (
              <li
                key={item}
                className="rounded-full bg-surface/60 px-2.5 py-1 text-[11px] text-text-secondary"
              >
                {item}
              </li>
            ))}
          </ul>
        </Column>

        <Column title={t.home.formats.title}>
          <ul className="space-y-2">
            {t.home.formats.items.map((format) => (
              <li
                key={format.name}
                className="flex items-baseline justify-between gap-4"
              >
                <span className="text-[12px] font-semibold text-text">
                  {format.name}
                </span>
                <span className="text-[12px] text-text-secondary">
                  {format.copy}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-5 text-text-tertiary">
            {t.home.formats.note}
          </p>
        </Column>

        <Column title={t.home.delivery.title}>
          <ul className="space-y-2.5">
            {t.home.delivery.lines.map((line) => (
              <li
                key={line}
                className="relative pl-4 text-[12px] leading-5 text-text-secondary"
              >
                <span
                  className="absolute left-0 top-[0.55em] h-[2px] w-2 bg-phantom"
                  aria-hidden="true"
                />
                {line}
              </li>
            ))}
          </ul>
        </Column>
      </div>
    </section>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <h3 className="mb-3 text-sm font-semibold text-text">{title}</h3>
      {children}
    </article>
  );
}
