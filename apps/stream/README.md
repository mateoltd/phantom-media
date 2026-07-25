# Phantom Stream

Search a film or a series, then let the app work through its sources until one
of them actually plays.

Part of the [Phantom monorepo](../../README.md). Install from the root.

## What it does

- Searches by title, IMDb link, TMDB URL or `movie:ID` / `tv:ID`. No API key
  and no account are involved at any point.
- Reads artwork, ratings, synopses and the full episode listing from Cinemeta
  in a single request, which is also where the TMDB id the resolver needs
  comes from. Wikidata bridges the identifiers on the rare title that lacks it.
- Starts routing the moment the page opens, asking several sources at once and
  taking the first that answers with something playable.
- Prefers 1080p and above when ranking what a source offers, because the
  difference is plain to see and half a second of extra latency is not.
- Reports what it learned about every source it asked, so picking one by hand
  is an informed choice rather than a guess.
- Hands off to the next source when one stalls mid-play, rather than dropping
  you back to a dead player.
- Remembers where you stopped, per episode, and resumes there.

## Routes

| Route              | What it serves                                                              |
| ------------------ | --------------------------------------------------------------------------- |
| `/`                | Browse: a featured title over rails of popular and highly rated films and series. |
| `/search?q=`       | Results grid.                                                               |
| `/watch/:type/:id` | Player and episode list. `:type` is `movie` or `tv`, `:id` is an IMDb id (a TMDB id still resolves). |

## Type

Labels, kickers and status words are set in the display face with tracking —
`.eyebrow` in the theme — not in the monospace one. Monospace is reserved for
figures that have to line up or be read exactly: timecodes, ratings, bitrates,
episode numbers.

Metadata rows are separated by space, not by interpuncts, and genres are tags
rather than a punctuated list. A row of `·` is a habit from printed listings.

## Surface

This app runs on the cinema surface — `@phantom/theme/cinema.css` — which
re-points the theme's own variables to ink. Same accent, same type, same radii
as the paper apps; nothing else in the system has to know which one it is on. A
paper ground would have sat in front of the thing you came to look at.

## Sources

Upstream identifies each playback source by a short code and labels it with a
third party's brand. This app keeps the codes, because the API needs them, and
replaces every label with a fixed in-house alias — `Source 01` through
`Source 14`. The mapping lives in `src/source-ids.mjs` and is the only place
those names are decided, so no third-party brand reaches a response body, a
screen or a log line. The aliases are positional and the order never changes,
which keeps `Source 07` meaning the same thing between sessions.

## The player

Built here rather than pulled in, because the source-routing behaviour above
has to reach into attachment and failure handling.

- Scrub bar with buffered ranges, hover preview and pointer dragging.
- Controls that get out of the way while something is playing and come back on
  any pointer move.
- Keyboard: <kbd>Space</kbd> or <kbd>K</kbd> to play, <kbd>J</kbd>/<kbd>L</kbd>
  for ten seconds, arrows to seek and set volume, <kbd>M</kbd> to mute,
  <kbd>N</kbd> for the next episode, <kbd>F</kbd> for fullscreen,
  <kbd>0</kbd>–<kbd>9</kbd> to jump by tenths.
- A quality menu of the stream's actual renditions, not of its URLs, with
  automatic switching that opens high rather than climbing up from 360p.
- The full episode list inside the picture, so changing episode never means
  leaving what you are watching. It opens on what is playing and survives
  fullscreen, because it is part of the stage rather than part of the page.
- An "up next" card over the closing stretch, sized to the runtime rather than
  to a fixed number of seconds, and an end-of-episode hand-off.
- Chapter skipping when — and only when — the stream declares chapters. There
  is no public source of intro and credit timings for film and television: the
  services that offer "skip intro" generate those markers from the files they
  host, and the one open dataset (AniSkip) covers anime only. A fixed guess
  would be wrong for most of what it was applied to, so nothing is offered
  where nothing is known.
- Subtitle menu, picture-in-picture and fullscreen.
- Adaptive HLS through `hls.js`, native HLS where the browser has it, and
  progressive MP4 as the fallback.
- The playhead, the buffer, the hover preview and the auto-hiding chrome are
  written to the DOM directly rather than held in React state. Sixty frames a
  second of scrubbing costs sixty style writes, not sixty renders.

## Local commands

```sh
pnpm --filter @phantom/stream dev
pnpm --filter @phantom/stream test        # resolver client and pool
pnpm --filter @phantom/stream typecheck
pnpm --filter @phantom/stream build
```

## Configuration

Copy `.env.example` to `.env`. Both values are optional; the app runs without
either.

## Legal

Phantom Stream hosts nothing. Every stream is played straight from a
third-party host, and the project is affiliated with none of the catalogs or
playback providers it talks to.
