"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Zap,
  CircleCheck,
  Download,
  Link as LinkIcon,
  ArrowRight,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { useI18n } from "@/components/locale-provider";
import { Logo } from "@phantom/ui";
import { SiteFooter } from "@/components/site-footer";
import { localePath } from "@/lib/i18n";

export default function HomePageClient() {
  return (
    <main className="landing-canvas flex min-h-screen flex-col">
      <AppHeader hideBrandOnDesktop />
      <Hero />
      <HomeDetails />

      <div className="app-shell mt-auto">
        <SiteFooter />
      </div>
    </main>
  );
}

function Hero() {
  const { messages: t } = useI18n();

  return (
    <section className="editorial-hero">
      <span className="poster-dots" aria-hidden="true" />

      <div className="editorial-stage app-shell">
        <div className="grid w-full items-center gap-12 pb-8 pt-4 lg:grid-cols-[minmax(380px,0.86fr)_minmax(560px,1.14fr)] lg:gap-14 lg:pb-20 lg:pt-4">
          <div className="hero-column relative z-10 max-w-2xl">
            <div
              className="hidden items-center gap-3.5 sm:gap-5 lg:flex"
              aria-label="Phantom"
            >
              <Logo
                size={72}
                decorative
                priority
                className="h-[clamp(3rem,4vw,4.4rem)] w-auto"
              />
              <p className="text-[clamp(2rem,4vw,4.5rem)] font-extrabold leading-none text-text">
                Phantom
              </p>
            </div>
            <span className="ink-underline hidden lg:block" aria-hidden="true" />

            <h1 className="hero-headline font-extrabold text-text lg:mt-8">
              {t.home.headlineTop}
              <br />
              {t.home.headlineBottom}
              <span className="text-phantom">.</span>
            </h1>

            <p className="mt-6 max-w-lg text-base font-bold leading-relaxed text-text lg:mt-7 lg:text-[clamp(1rem,1.5vw,1.4rem)]">
              {t.home.promise}
            </p>
          </div>

          <div className="workflow-visual relative z-10 mx-auto hidden w-full max-w-[720px] lg:block">
            <Image
              src="/brush-stroke.png"
              width={1693}
              height={929}
              alt=""
              aria-hidden="true"
              preload
              fetchPriority="high"
              sizes="(min-width: 1024px) 31rem, 0px"
              className="paint-scratch"
            />
            <div className="workflow-grid relative z-10 grid items-stretch gap-0 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <WorkflowStep
                index="1"
                icon={<LinkIcon size={40} strokeWidth={2.35} />}
                title={t.home.desktopSteps[0]}
                tone="neutral"
              />
              <span className="poster-arrow" aria-hidden="true">
                <ArrowRight size={20} strokeWidth={2.4} />
              </span>
              <WorkflowStep
                index="2"
                icon={<Zap size={44} fill="currentColor" strokeWidth={1.4} />}
                title={t.home.desktopSteps[1]}
                tone="active"
              />
              <span className="poster-arrow" aria-hidden="true">
                <ArrowRight size={20} strokeWidth={2.4} />
              </span>
              <WorkflowStep
                index="3"
                icon={<Download size={42} strokeWidth={2.35} />}
                title={t.home.desktopSteps[2]}
                tone="complete"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowStep({
  index,
  icon,
  title,
  tone,
}: {
  index: string;
  icon: React.ReactNode;
  title: string;
  tone: "neutral" | "active" | "complete";
}) {
  return (
    <article className="poster-card flex min-h-[300px] flex-col items-center px-5 py-6 text-center">
      <span className="absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-text font-mono text-xs font-extrabold text-white">
        {index}
      </span>
      <span
        className={`mt-9 flex h-28 w-28 items-center justify-center rounded-full ${
          tone === "active"
            ? "bg-phantom-soft text-phantom"
            : tone === "complete"
              ? "bg-[#dfe5d5] text-text"
              : "bg-[#e9e3d8] text-text"
        }`}
      >
        {icon}
      </span>
      <p className="mt-6 text-sm font-extrabold text-text">{title}</p>
      {tone === "active" && (
        <span className="mt-auto block h-3 w-full overflow-hidden rounded-full border border-text/10 bg-[#e8ddca]">
          <span className="block h-full w-[68%] rounded-full bg-phantom" />
        </span>
      )}
      {tone === "complete" && (
        <CircleCheck size={35} fill="currentColor" className="mt-auto text-[#65ad4c] [&_path]:stroke-white" />
      )}
      {tone === "neutral" && (
        <span className="mt-auto flex h-10 w-full items-center overflow-hidden rounded-xl border border-border bg-surface text-left">
          <span className="min-w-0 flex-1 truncate px-2 font-mono text-[8px] text-text-secondary">
            https://example.com/video
          </span>
          <span className="flex h-full w-10 shrink-0 items-center justify-center bg-phantom text-lg font-bold text-white">
            <ArrowRight size={18} strokeWidth={2.4} />
          </span>
        </span>
      )}
    </article>
  );
}

function HomeDetails() {
  const { locale, messages: t } = useI18n();

  return (
    <section className="app-shell pb-12 pt-4 sm:pb-16 sm:pt-6">
      <div className="grid gap-x-12 gap-y-9 border-t-2 border-text/85 pt-7 md:grid-cols-3 md:pt-8">
        <Column index="01" title={t.home.accepts.title}>
          <ul className="flex flex-wrap gap-1.5">
            {t.home.accepts.items.map((item) => (
              <li
                key={item}
                className="rounded-full border border-border bg-surface/60 px-2.5 py-1 font-mono text-[10px] text-text-secondary"
              >
                {item}
              </li>
            ))}
          </ul>
        </Column>

        <Column index="02" title={t.home.formats.title}>
          <ul>
            {t.home.formats.items.map((format) => (
              <li
                key={format.name}
                className="flex items-baseline justify-between gap-4 border-b border-black/[0.07] py-1.5 last:border-b-0"
              >
                <span className="font-mono text-[12px] font-extrabold text-text">
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

        <Column index="03" title={t.home.delivery.title}>
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

      <p className="mt-9 max-w-2xl text-[11px] leading-5 text-text-tertiary">
        {t.home.independent} {t.home.authorizedOnly}{" "}
        <Link
          href={localePath(locale, "/disclaimer")}
          className="font-bold underline underline-offset-4"
        >
          {t.home.disclaimer}.
        </Link>
      </p>
    </section>
  );
}

function Column({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article>
      <span className="font-mono text-[11px] font-extrabold text-phantom">
        {index}
      </span>
      <h2 className="mb-4 mt-2 text-[15px] font-extrabold text-text">{title}</h2>
      {children}
    </article>
  );
}
