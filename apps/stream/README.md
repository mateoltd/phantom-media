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

| Route                | What it serves                                        |
| -------------------- | ----------------------------------------------------- |
| `/`                  | Landing page and search.                              |
| `/search?q=`         | Results grid.                                         |
| `/watch/:type/:id`   | Player. `:type` is `movie` or `tv`, `:id` is a TMDB id. |

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
- Next and previous episode in the chrome, an end-of-episode hand-off, and a
  jump offered over the opening minutes. It is labelled by the distance it
  covers, not as "skip intro" — there is no chapter data behind it.
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
