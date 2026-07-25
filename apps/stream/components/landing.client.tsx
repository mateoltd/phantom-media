"use client";

import Image from "next/image";
import {
  IconArrowRight,
  IconCircleCheckFilled,
  IconDeviceTvOld,
  IconSearch,
  IconStack2,
} from "@tabler/icons-react";
import { Logo } from "@phantom/ui";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";

export default function LandingPageClient() {
  return (
    <main className="landing-canvas flex min-h-screen flex-col">
      <AppHeader hideBrandOnDesktop />
      <Hero />
      <LandingDetails />

      <div className="app-shell mt-auto">
        <SiteFooter />
      </div>
    </main>
  );
}

function Hero() {
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
              Find it.
              <br />
              Press play
              <span className="text-phantom">.</span>
            </h1>

            <p className="mt-6 max-w-lg text-base font-bold leading-relaxed text-text lg:mt-7 lg:text-[clamp(1rem,1.5vw,1.4rem)]">
              Search by title or paste an IMDb link. Phantom works through its
              sources until one of them actually plays.
            </p>
          </div>

          <div className="relative z-10 mx-auto hidden w-full max-w-[720px] lg:block">
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
            <div className="relative z-10 grid items-stretch gap-0 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <RouteStep
                index="1"
                icon={<IconSearch size={40} stroke={2.35} />}
                title="Find the title"
                tone="neutral"
              />
              <span className="poster-arrow" aria-hidden="true">
                <IconArrowRight size={20} stroke={2.4} />
              </span>
              <RouteStep
                index="2"
                icon={<IconStack2 size={44} stroke={2.1} />}
                title="Work through the sources"
                tone="active"
              />
              <span className="poster-arrow" aria-hidden="true">
                <IconArrowRight size={20} stroke={2.4} />
              </span>
              <RouteStep
                index="3"
                icon={<IconDeviceTvOld size={42} stroke={2.35} />}
                title="Play the one that answers"
                tone="complete"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RouteStep({
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
        <IconCircleCheckFilled size={35} className="mt-auto text-[#65ad4c]" />
      )}
      {tone === "neutral" && (
        <span className="mt-auto flex h-10 w-full items-center justify-center rounded-xl border border-border bg-surface font-mono text-[10px] text-text-secondary">
          title, IMDb link, or ID
        </span>
      )}
    </article>
  );
}

const ACCEPTS = [
  "Dune: Part Two",
  "tt15239678",
  "movie:693134",
  "imdb.com/title/…",
] as const;

const PLAYBACK = [
  "Adaptive HLS where it is offered, progressive MP4 where it is not.",
  "Every manifest is fetched before it is trusted, and the fastest one wins.",
  "A source that stalls mid-play hands off to the next without restarting you.",
] as const;

function LandingDetails() {
  return (
    <section className="app-shell pb-12 pt-4 sm:pb-16 sm:pt-6">
      <div className="grid gap-x-12 gap-y-9 border-t-2 border-text/85 pt-7 md:grid-cols-3 md:pt-8">
        <Column index="01" title="What you can search">
          <ul className="flex flex-wrap gap-1.5">
            {ACCEPTS.map((item) => (
              <li
                key={item}
                className="rounded-full border border-border bg-surface/60 px-2.5 py-1 font-mono text-[10px] text-text-secondary"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-5 text-text-tertiary">
            Titles come from open catalogs, so no key and no account are
            involved at any point.
          </p>
        </Column>

        <Column index="02" title="How sources are chosen">
          <ul>
            <SourceRow name="14" copy="sources, tried in health order" />
            <SourceRow name="2.5s" copy="to answer a manifest probe" />
            <SourceRow name="5s" copy="to start playing before it is dropped" />
          </ul>
          <p className="mt-3 text-[12px] leading-5 text-text-tertiary">
            A source that fails goes on cooldown, so the next search does not
            spend time on it again.
          </p>
        </Column>

        <Column index="03" title="What playback gives you">
          <ul className="space-y-2.5">
            {PLAYBACK.map((line) => (
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
        Phantom Stream is an independent project and is not affiliated with any
        catalog or playback provider. It hosts nothing itself: every stream is
        played straight from a third-party host.
      </p>
    </section>
  );
}

function SourceRow({ name, copy }: { name: string; copy: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-black/[0.07] py-1.5 last:border-b-0">
      <span className="font-mono text-[12px] font-extrabold text-text">
        {name}
      </span>
      <span className="text-[12px] text-text-secondary">{copy}</span>
    </li>
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
