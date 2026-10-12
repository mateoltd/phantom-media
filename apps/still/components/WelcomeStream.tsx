"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { ATTEMPT, MADE_ATTEMPT, ROLL, SCORED, TOASTING, kitchen, score, tracks, type Reel } from "./welcome-stream-motion";

/** The locked video out of focus and in shade, as a picture: what the lock shows, without blurring anything live. */
export const STREAM_FOG = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><filter id="f" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="4"/></filter><path fill="#222e30" d="M0 0h320v180H0z"/><g filter="url(#f)"><g transform="translate(320 170) scale(1.3) translate(-320 -170)"><path fill="#222e30" d="M-20 -20h360v220H-20z"/><path fill="#2e3f40" d="M-20 132h360v68H-20z"/><path d="M142-20h200v126H142Z" fill="#171f20" stroke="#2e3f40" stroke-width="4"/><path d="M282-20V106" stroke="#2e3f40" stroke-width="4"/><path fill="#2e3f40" d="M136 106h204v6H136z"/><g transform="translate(208 91) scale(.9)"><path d="M1 32V14Q1 0 15 0h26q14 0 14 14v18q0 8-8 8H9q-8 0-8-8Z" fill="#49605f"/><path d="M43 1q12 1 12 13v18q0 8-8 8h-8q6-4 6-12V14q0-8-2-13Z" fill="#2e3f40"/><path fill="#2e3f40" d="M0 37h56v5H0z"/></g><rect x="156" y="101" width="40" height="31" rx="15.500" fill="#aaa99d"/><path fill="#171f20" d="M164.600 113.700h8.600v5.600h-8.600zM178.900 113.700h8.600v5.600h-8.600z"/></g></g><path fill="#050607" fill-opacity=".64" d="M0 0h320v180H0z"/></svg>')}")`;

/** The channel's own picture, as a channel would have one: the shooter's face, not a frame of its stream. */
export const STREAM_AVATAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path fill="#2e3f40" d="M0 0h96v96H0z"/><path fill="#171f20" d="M0 66h96v30H0z"/><clipPath id="b"><rect x="14" y="26" width="68" height="52" rx="26"/></clipPath><rect x="14" y="26" width="68" height="52" rx="26" fill="#81938b"/><path fill="#49605f" clip-path="url(#b)" d="M14 34h68v7H14z"/><rect x="29" y="48" width="14" height="10" rx="2.500" fill="#171f20"/><rect x="53" y="48" width="14" height="10" rx="2.500" fill="#171f20"/></svg>')}`;
/** And its banner: the same court, with the shot that the stream is about on its way. */
export const STREAM_BANNER = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice"><path fill="#222e30" d="M0 0h1200v300H0z"/><path fill="#171f20" d="M690 215a150 150 0 0 1 300 0Z"/><path fill="#2e3f40" d="M0 215h1200v85H0z"/><path d="M1040 215V100M1040 112h-48M990 92v48M1024 215h32" fill="none" stroke="#49605f" stroke-width="10" stroke-linecap="round"/><path d="M936 134l8 28h36l8-28M952 134l4 28M972 134l-4 28M940 148h44" fill="none" stroke="#49605f" stroke-width="2" stroke-linejoin="round"/><rect x="932" y="128" width="58" height="6" rx="3" fill="#b78159"/><g fill="#49605f"><circle cx="608" cy="150" r="3"/><circle cx="656" cy="118" r="3.500"/><circle cx="704" cy="95" r="4"/><circle cx="752" cy="82" r="4.500"/><circle cx="800" cy="76" r="5"/></g><circle cx="848" cy="80" r="15" fill="#b78159"/><path d="M833 80h30M839.500 67.500q10 12.500 0 25M856.500 67.500q-10 12.500 0 25" fill="none" stroke="#171f20" stroke-width="2.200"/><ellipse cx="520" cy="215" rx="46" ry="4" fill="#171f20"/><clipPath id="b"><rect x="470" y="138" width="100" height="77" rx="38.500"/></clipPath><rect x="470" y="138" width="100" height="77" rx="38.500" fill="#81938b"/><path fill="#49605f" clip-path="url(#b)" d="M470 150h100v10H470z"/><rect x="496" y="170" width="20" height="14" rx="3.500" fill="#171f20"/><rect x="531" y="170" width="20" height="14" rx="3.500" fill="#171f20"/></svg>')}`;

/**
 * Threads the stream through the drawing under `root`: one attempt of keyframes, looped, and the score beside it.
 *
 * Running animations live on the compositor, where every change to one is a restart that ships its keyframes again.
 * So they are kept short, and nothing is changed while they run: they are stopped, put where they should be, and
 * started once.
 */
function thread(root: HTMLElement, start: number, court: boolean) {
  // The toaster video has no second set and no score: it is one round, looped.
  const missing: readonly (readonly [string, Keyframe[]])[] = court ? tracks(false) : kitchen(), going = court ? tracks(true) : null;
  const loops = missing.flatMap(([selector, keyframes]) => root.querySelector(selector)?.animate([...keyframes], { duration: court ? ATTEMPT : TOASTING, iterations: Infinity }) ?? []);
  const flips = court ? score().flatMap(([selector, keyframes]) => root.querySelector(selector)?.animate([...keyframes], { delay: SCORED, duration: ROLL, fill: "both" }) ?? []) : [];
  let made = false, playing = false, resuming = 0, changing = 0;
  const now = () => Number(loops[0]?.currentTime ?? 0);
  const stop = () => { for (const animation of [...loops, ...flips]) animation.pause(); };
  // The attempt that goes in is its own set of keyframes. An attempt only differs once the ball is in the air, so
  // they can be changed over late, at no exact moment.
  const dress = (at: number) => {
    if (!going || made === (Math.floor(at / ATTEMPT) === MADE_ATTEMPT)) return;
    made = !made;
    loops.forEach((animation, index) => (animation.effect as KeyframeEffect).setKeyframes([...(made ? going : missing)[index][1]]));
  };
  const watch = () => {
    window.clearTimeout(changing);
    if (!going) return;
    const at = now(), next = (Math.floor(at / ATTEMPT) + 1) * ATTEMPT;
    if (playing && next <= (MADE_ATTEMPT + 1) * ATTEMPT) changing = window.setTimeout(() => { dress(now()); watch(); }, next - at + 200);
  };
  const run = () => {
    for (const animation of loops) animation.play();
    // A finished animation that is played starts over, which the score must not.
    for (const animation of flips) if (Number(animation.currentTime) < SCORED + ROLL) animation.play();
    watch();
  };
  const seek = (ms: number) => {
    const at = Math.max(0, ms);
    window.clearTimeout(resuming);
    window.clearTimeout(changing);
    stop();
    dress(at);
    for (const animation of [...loops, ...flips]) animation.currentTime = at;
    // Dragged along a timeline it is put somewhere new every frame, and only picks up once that has stopped.
    if (playing) resuming = window.setTimeout(run, 90);
  };
  seek(start);
  return {
    now,
    seek,
    roll: (on: boolean) => {
      playing = on;
      window.clearTimeout(resuming);
      window.clearTimeout(changing);
      if (on) run(); else stop();
    },
    cancel: () => {
      window.clearTimeout(resuming);
      window.clearTimeout(changing);
      for (const animation of [...loops, ...flips]) animation.cancel();
    },
  };
}

/**
 * The stream the welcome tour watches: somebody shooting hoops, drawn here and nowhere else. It is the tour's own, so
 * nothing is fetched for it, no real channel is shown under an ad or a lock it never had, and it has a past to
 * rewind into. One shot goes in, which is what the visitor is made to miss and then goes back for.
 *
 * It is one timeline that the tour's script reads and moves (see Reel), so playing, stopping under a break, running
 * backwards under the timeline and jumping to live are all the same thing. Only transforms and opacities move. It is
 * drawn quietly, in the page's own dark, so that the mascot stays the brightest thing on screen.
 */
export function WelcomeStream({ ref, show, start, rolling }: {
  ref: Ref<Reel>;
  /** Which of the two videos it is: the live one, or the one Twitch keeps locked. */
  show: "court" | "kitchen";
  /** Where in the stream it opens. */
  start: number;
  rolling: boolean;
}) {
  const film = useRef<HTMLDivElement>(null);
  const reel = useRef<ReturnType<typeof thread>>(null);

  useLayoutEffect(() => {
    if (!film.current) return;
    const threaded = thread(film.current, start, show === "court");
    reel.current = threaded;
    return () => { threaded.cancel(); reel.current = null; };
  }, [start, show]);

  useImperativeHandle(ref, () => ({ now: () => reel.current?.now() ?? 0, seek: (ms) => reel.current?.seek(ms) }), []);

  useEffect(() => {
    // Reduced motion gets the stream as stills: it is only ever put somewhere, never played.
    reel.current?.roll(rolling && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [rolling, start, show]);

  return <div ref={film} className="still-tour-film" aria-hidden="true">
    {show === "court" ? <div className="still-tour-court">
      <svg className="still-tour-setting" viewBox="0 0 320 180" fill="none">
        <path fill="var(--wall)" d="M0 0h320v132H0z" />
        <path fill="var(--ink)" d="M124 132a92 92 0 0 1 184 0Z" />
        <path fill="var(--floor)" d="M0 132h320v48H0z" />
        <path d="M0 154h320" stroke="var(--line)" />
        <path d="M298 132V68M298 74h-24M272 54v32M290 132h16" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="still-tour-board"><b>0</b><b>1</b></span>
      <span className="still-tour-shadow" />
      <span className="still-tour-ground" />
      <span className="still-tour-player">
        <svg className="still-tour-figure" viewBox="0 0 40 31" fill="none">
          <clipPath id="still-tour-body"><rect width="40" height="31" rx="15.5" /></clipPath>
          <rect width="40" height="31" rx="15.5" fill="var(--sage)" />
          <path d="M0 5h40v4H0z" fill="var(--line)" clipPath="url(#still-tour-body)" />
        </svg>
        <span className="still-tour-gaze">
          <i /><i />
        </span>
      </span>
      <span className="still-tour-ball">
        <svg viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="6" fill="var(--warm)" />
          <path d="M0 6h12M2.6 1q4 5 0 10M9.4 1q-4 5 0 10" stroke="var(--ink)" strokeWidth="0.9" />
        </svg>
      </span>
      <span className="still-tour-net">
        <svg viewBox="0 0 22 16" fill="none">
          <path d="M1 0l4 15h12l4-15M6 0l3 15M16 0l-3 15M3 7h16" stroke="var(--line)" strokeWidth="0.8" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="still-tour-hoop" />
    </div> : <div className="still-tour-kitchen">
      <svg className="still-tour-setting" viewBox="0 0 320 180" fill="none">
        <path fill="var(--wall)" d="M0 0h320v132H0z" />
        <path fill="var(--floor)" d="M0 132h320v48H0z" />
        <path d="M0 132h320" stroke="var(--line)" />
        <path d="M142-8h190v114H142Z" fill="var(--ink)" stroke="var(--floor)" strokeWidth="4" strokeLinejoin="round" />
        <path d="M282-8V106" stroke="var(--floor)" strokeWidth="4" />
        <rect x="136" y="106" width="196" height="6" rx="2" fill="var(--floor)" />
        <path d="M168 22h.01M214 14h.01M252 40h.01M300 26h.01M194 56h.01" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="234" cy="132" rx="27" ry="2" fill="var(--ink)" />
      </svg>
      <span className="still-tour-toast">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="M1 19v-9C-1 9 0 2 5 2q5-2 10 0c5 0 6 7 4 8v9q0 1-1 1H2q-1 0-1-1Z" fill="var(--warm)" />
          <path d="M3 17V8c-2 0-1-4 2-4q5-2 10 0c3 0 4 4 2 4v9q0 1-1 1H4q-1 0-1-1Z" fill="var(--toast)" />
        </svg>
      </span>
      <span className="still-tour-toaster">
        <svg viewBox="0 0 58 46" fill="none">
          <path d="M8 40h8v6H8zM42 40h8v6h-8z" fill="var(--ink)" />
          <path d="M1 32V14Q1 0 15 0h26q14 0 14 14v18q0 8-8 8H9q-8 0-8-8Z" fill="var(--line)" />
          <path d="M43 1q12 1 12 13v18q0 8-8 8h-8q6-4 6-12V14q0-8-2-13Z" fill="var(--floor)" />
          <path d="M17 0h24v1q0 2-2 2H19q-2 0-2-2Z" fill="var(--ink)" />
          <rect y="37" width="56" height="5" rx="2" fill="var(--floor)" />
          <path d="M51 14v14" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
          <circle cx="35" cy="28" r="4" fill="var(--floor)" stroke="var(--ink)" strokeWidth="2" />
          <path d="M35 25v2" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="still-tour-lever" />
      </span>
      <span className="still-tour-ground" />
      <span className="still-tour-sitter">
        <svg className="still-tour-figure" viewBox="4 10 56 44" preserveAspectRatio="none" fill="none">
          <path d="M26 10h12a22 22 0 0 1 0 44H26a22 22 0 0 1 0-44Z" fill="var(--cream)" />
        </svg>
        <span className="still-tour-gaze">
          <i /><i />
        </span>
      </span>
    </div>}
  </div>;
}
