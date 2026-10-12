"use client";

import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { setWelcomePhase, subscribeWelcome, welcomePhase, type WelcomePhase } from "@/lib/welcome";
import { HOME_SEARCH_INPUT } from "./discovery/HomeSearch";
import { WelcomeTour } from "./WelcomeTour";

const finish = () => setWelcomePhase("done");

/** How long the mascot takes to reach the header, and how long when it was told to skip the rest. */
const LANDING = 760, SKIPPING = 440;

/**
 * Sends the mascot to the header logo's face while the page appears behind it. What fades does so from however
 * it looks at that moment, since Skip can call this before the greeting has been said.
 */
function land(overlay: HTMLElement, duration: number): Animation[] {
  const timing = { duration, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" } as const;
  const flight = Array.from(overlay.querySelectorAll(".still-welcome-greeting, .still-welcome-skip, .still-welcome-dream"), (part) => part.animate({ opacity: 0 }, { duration: 200, fill: "forwards" }));
  const backdrop = overlay.querySelector(".still-welcome-backdrop");
  if (backdrop) flight.push(backdrop.animate({ opacity: [1, 0] }, timing));
  const mascot = overlay.querySelector(".still-welcome-mascot");
  const logo = document.querySelector(".still-brand-logo")?.getBoundingClientRect();
  if (!mascot) return flight;
  // Narrow screens hide the brand while their search is open: with nowhere to land, the mascot leaves with the rest.
  if (!logo?.height) return [...flight, mascot.animate({ opacity: [1, 0] }, timing)];
  // The face is the square at the start of the logo, drawn in the same 64 unit box as the mascot.
  const from = mascot.getBoundingClientRect();
  const x = logo.left + logo.height / 2 - (from.left + from.width / 2);
  const y = logo.top + logo.height / 2 - (from.top + from.height / 2);
  return [...flight, mascot.animate({ transform: ["none", `translate(${x}px, ${y}px) scale(${logo.height / from.width})`] }, timing)];
}

/**
 * The first visit to the home page: the mascot fills the screen, says hello and settles into the header logo, then
 * shows what Still does (see WelcomeTour). It is part of the page's static HTML and WELCOME_HINT decides whether
 * it shows, so the page is never painted first and covered afterwards. Skippable throughout, and seen once.
 */
export function Welcome() {
  const phase = useSyncExternalStore(subscribeWelcome, welcomePhase, (): WelcomePhase => "pending");
  const overlay = useRef<HTMLDivElement>(null);
  const leave = useRef(finish);
  const faceId = useId();

  // Keeps what lib/welcome.ts wrote on <html> true, and writes it when the page was reached without a reload.
  useLayoutEffect(() => {
    if (phase === "pending") return;
    const page = document.documentElement.dataset;
    if (phase === "done") delete page.welcome; else page.welcome = phase;
    return () => { delete page.welcome; };
  }, [phase]);

  useEffect(() => {
    // The search kept waiting (see HomeSearch) takes the keyboard once the page is no longer covered.
    if (phase === "done" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) document.getElementById(HOME_SEARCH_INPUT)?.focus({ preventScroll: true });
    const element = overlay.current;
    if (phase !== "intro" || !element) return;
    // The takeover is all motion. Without it, the mascot is already in the header and the tour starts there.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setWelcomePhase("talk"); return; }

    const covered = Array.from(document.body.children).filter((child): child is HTMLElement => child instanceof HTMLElement && !child.contains(element) && !child.inert && /^(HEADER|MAIN|SECTION)$/.test(child.tagName));
    covered.forEach((child) => { child.inert = true; });
    const hold = (event: Event) => event.preventDefault();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") leave.current(); };
    element.addEventListener("wheel", hold, { passive: false });
    element.addEventListener("touchmove", hold, { passive: false });
    window.addEventListener("keydown", escape);
    element.querySelector("button")?.focus({ preventScroll: true });

    // The greeting is CSS, so it starts with the first paint, before this runs. This only waits for it to end.
    let live = true;
    let skipped = false;
    let flight: Animation[] = [];
    const depart = (duration: number) => {
      if (!flight.length) flight = land(element, duration);
      return Promise.all(flight.map((animation) => animation.finished));
    };
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
      .then(() => { if (live && !skipped) return depart(LANDING); })
      .then(() => { if (live && !skipped) setWelcomePhase("talk"); })
      .catch(() => {});
    // Skipped: the mascot still lands in the header, sooner, and there is no tour after it.
    leave.current = () => {
      if (skipped) return;
      skipped = true;
      depart(SKIPPING).then(() => { if (live) finish(); }).catch(() => {});
    };

    return () => {
      live = false;
      leave.current = finish;
      flight.forEach((animation) => animation.cancel());
      covered.forEach((child) => { child.inert = false; });
      element.removeEventListener("wheel", hold);
      element.removeEventListener("touchmove", hold);
      window.removeEventListener("keydown", escape);
    };
  }, [phase]);

  if (phase === "done") return null;
  if (phase === "talk") return <WelcomeTour />;
  return <div ref={overlay} className="still-welcome">
    <div className="still-welcome-backdrop" />
    <div className="still-welcome-stage">
      <div className="still-welcome-mascot">
        <svg viewBox="0 0 64 64" fill="#f4f2eb" aria-hidden="true" focusable="false">
          <defs>
            <mask id={faceId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64" style={{ maskType: "luminance" }}>
              <rect width="64" height="64" fill="white" />
              <g className="still-welcome-eyes" fill="black">
                <rect x="16" y="30" width="12" height="4" rx="2" />
                <rect x="36" y="30" width="12" height="4" rx="2" />
              </g>
            </mask>
          </defs>
          <g className="still-welcome-face">
            <path mask={`url(#${faceId})`} d="M26 10h12a22 22 0 0 1 0 44H26a22 22 0 0 1 0-44Z" />
          </g>
          <g fill="none" stroke="#f4f2eb" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path className="still-welcome-dream" d="M0 0h7L0 7h7" />
            <path className="still-welcome-dream" d="M0 0h7L0 7h7" />
          </g>
        </svg>
      </div>
      <p className="still-welcome-greeting">Hi, I&rsquo;m Still.</p>
    </div>
    <button type="button" className="still-welcome-skip" onClick={() => leave.current()}>Skip</button>
  </div>;
}
