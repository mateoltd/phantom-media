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
which keeps `Source 07` meaning the same thing between sessions. That last part
is why the id list is append-only: inserting one renumbers every alias after it.

`normalizeVariants` in `src/providers/normalize.mjs` is the only function that
can mint a candidate, and it stamps identity from the catalog while discarding
whatever the provider supplied for those fields. `test/providers.test.mjs`
asserts that no upstream name survives it, which makes the rule a build gate
rather than something each new provider has to remember.

### Adding one

- **Another relay scraper.** Append its two-character code to `SOURCE_IDS` in
  `src/source-ids.mjs`. Nothing else — the alias, the catalog entry, the
  registry entry, the roster and the API route all follow.
- **A different kind of source.** Append `{ id, kind }` to `DECLARED` in
  `src/providers/catalog.mjs`, write `src/providers/<kind>.mjs` exporting
  `create<Kind>Resolver(id)`, and add one line to `RESOLVERS` in
  `registry.mjs`. Resolvers are keyed by kind, so fourteen more of a kind that
  already works cost nothing. The whole contract:

  ```js
  async (media, { signal, fresh }) => ({
    candidates: normalizeVariants(rawVariants, id),
    subtitles: [],
    latencyMs: number,
  })
  ```

  Errors throw a `RelayError` shape: `{ status, retryable, retryAfterMs }`. A
  provider never names itself and never scores itself.

## Routing

Sources are raced, not tried in turn, and the race is decided by what each one
actually produced rather than by which answered first — a fast source holding a
480p file should not beat a slower one holding 1080p.

- Five at a time, narrowing to two after a rate limit and climbing back one per
  clean race. One request here is one request upstream, and a single 429 arms a
  cooldown that affects every source on the isolate, so a wider burst is
  actively dangerous rather than merely rude.
- Seven seconds per source, end to end: five for the scrape and one round of
  manifest probing after it. The sum is the number that matters, because a slot
  is the scarcest thing in the race — every source still queued is waiting
  behind whoever holds one.
- **A request the router walks away from is not a failure.** When one source
  wins, its four siblings are aborted; those aborts used to reach the server as
  errors and cool the source that was serving them, so every *successful* race
  benched the four it had abandoned. The pool outlives the page, so the next
  load raced without them — which is what the minute-long waits actually were.
- An offer that is already excellent — a **verified** 1080p or adaptive master —
  goes on screen immediately. Anything less is held for up to 1.2s, capped at
  4s from the start of the race, to see whether something better is close
  behind. A stream that merely *claims* 1080p has proven nothing; only a
  manifest that answered counts.
- Attaching runs alongside collection instead of blocking it, so a source that
  fails to start costs the element and nothing else.
- Picking a source by hand pins it. The router will not quietly play a
  different one; a pinned source that dies gets one retry and then says so.
  **Automatic** at the top of the list is the way back.

### Scoring

`src/source-score.mjs` turns one race against one source into a reward in
`[0,1]` — half for producing a playable stream at all, 0.3 for resolution, 0.2
for speed, with half taken back if it dies within thirty seconds of attaching —
and folds it into a running mean whose weight decays with wall-clock age.
Records are kept per source and per source-and-season; the global record is the
prior that per-title evidence shifts, so a title that loads cleanly from one
source bends *that title* toward it while everything unmeasured still follows
the general record.

A rate limit records nothing, because the upstream cooldown is process-wide and
whichever source was in flight is not the one at fault. New sources start with
an optimistic prior and the last slot of the first wave is reserved for the
least-measured one, so nothing gets buried by two unlucky attempts.

Scores live in `localStorage` behind a two-method synchronous transport
(`lib/source-score.ts`), so they are per-device today and a shared store is a
drop-in later — `{v, w, t}` records merge as weighted means, which is what would
make "voted down by other sessions" work without a schema change.

## Subtitles

Whatever the playback source returned, merged with the keyless OpenSubtitles
addon (`opensubtitles-v3.strem.io`, keyed on IMDb ids). OpenSubtitles' own REST
API is not usable here — a free account allows five to twenty downloads a *day*.

Everything is fetched through `/api/subtitles/file`, which converts SubRip to
WebVTT, decodes legacy encodings, and serves same-origin. That last part is the
reason it exists: a `<track>` on a `crossOrigin="anonymous"` video fails
silently against any host without CORS headers, which is most of them, and
silently is the worst way for a subtitle to fail. The route is restricted to
the catalogue's own hosts — without an allowlist, an endpoint that fetches a URL
from a query string is an open proxy.

Cues are painted by the player rather than by the browser, which is the only way
they can be sized, given a backdrop, and moved clear of the controls. Files are
still parsed by the browser's own WebVTT parser (`getCueAsHTML`), so no
third-party text file is ever treated as markup.

## The player

Built here rather than pulled in, because the source-routing behaviour above
has to reach into attachment and failure handling.

- Two gradient bands sharing one idle timer, so the picture is framed rather
  than having one heavy strip along the bottom. The top one carries what is
  playing, which in fullscreen is otherwise nowhere on screen.
- Scrub bar with buffered ranges, hover preview and pointer dragging.
- One settings sheet — quality, speed, subtitles, subtitle appearance, source —
  instead of four popovers behind four near-identical glyphs.
- A quality menu of the stream's actual renditions, not of its URLs, with
  automatic switching that opens high rather than climbing up from 360p.
- While a race is running: a mark per source coloured by what it said, and a
  count. A spinner looks the same whether three sources have answered or none,
  which is what made a slow search feel like a stuck one.
- Volume, subtitle language, subtitle size and speed are remembered. Picking a
  language once picks it for the series — the index of a language changes with
  every track list, the language does not.
- Resuming says so, dismissibly, with a way to start over. It used to seek
  silently.
- The full episode list inside the picture, so changing episode never means
  leaving what you are watching. It opens on what is playing and survives
  fullscreen, because it is part of the stage rather than part of the page.
- An "up next" card over the closing stretch, sized to the runtime rather than
  to a fixed number of seconds, and a cancellable countdown at the end rather
  than a jump nobody asked for.
- Chapter skipping when — and only when — the stream declares chapters. There
  is no public source of intro and credit timings for film and television: the
  services that offer "skip intro" generate those markers from the files they
  host, and the one open dataset (AniSkip) covers anime only. A fixed guess
  would be wrong for most of what it was applied to, so nothing is offered
  where nothing is known.
- Keyboard: <kbd>Space</kbd>/<kbd>K</kbd> play, <kbd>J</kbd>/<kbd>L</kbd> ten
  seconds, arrows to seek and set volume, <kbd>M</kbd> mute, <kbd>C</kbd>
  subtitles, <kbd>N</kbd> next episode, <kbd>E</kbd> episodes, <kbd>F</kbd>
  fullscreen, <kbd>&lt;</kbd>/<kbd>&gt;</kbd> speed,
  <kbd>0</kbd>–<kbd>9</kbd> to jump by tenths, <kbd>?</kbd> for the list.
- On a touch screen the picture is not a play button: a tap shows the controls
  and a double tap on either side seeks.
- Adaptive HLS through `hls.js`, native HLS where the browser has it, and
  progressive MP4 as the fallback.
- The playhead, the buffer, the hover preview and the auto-hiding chrome are
  written to the DOM directly rather than held in React state. Sixty frames a
  second of scrubbing costs sixty style writes, not sixty renders.

## Debugging a slow start

Append `?debug=1` to any watch URL. The choice is remembered, which is the
point — a race that is slow once and fine the next four times is only ever
caught by an instrument that was already running.

Every timing the router has goes to the console and into a ring buffer of the
last two thousand events: when each slot opened, what each source was asked and
what it answered, every manifest probe with its host and latency, each step of
the race reducer with what it was holding and how long the window had left,
attachment and hls.js errors, and each score written. With the log on, requests
carry `x-phantom-debug: 1` and the resolve route answers with its own timings,
so an upstream that is slow can be told apart from a route that was queued.

```js
__phantom.help()      // the rest of the commands
__phantom.sources()   // a table of every source's progress this session
__phantom.summary()   // counts per channel and the twenty slowest spans
__phantom.copy()      // the whole buffer as JSON, onto the clipboard
__phantom.off()       // and stop
```

`STREAM_DEBUG=1` does the server's half, onto stdout: relay cache hits, cooldown
state, upstream latency per scrape.

Switched off, the log costs one `if` per call site and allocates nothing.

## Local commands

```sh
pnpm --filter @phantom/stream dev
pnpm --filter @phantom/stream test        # scoring, routing policy, providers, subtitles, debug
pnpm --filter @phantom/stream typecheck
pnpm --filter @phantom/stream build
```

## Configuration

Copy `.env.example` to `.env`. Both values are optional; the app runs without
either.

## Legal

Phantom Stream hosts nothing. Every stream is played straight from a
third-party host by the viewer's own browser, and the project is affiliated
with none of the catalogs or playback providers it talks to.

`/disclaimer` states that in full: no hosting, no affiliation, authorized use
only, no warranty, and a limitation of liability. It is linked from the footer
of every page.

Set `NEXT_PUBLIC_NOTICE_EMAIL` before deploying. Until it is set, the page
omits its infringement-reporting section, because a takedown route with no
address behind it is worse than none — and a reachable takedown route is the
most useful thing on a page like this.
