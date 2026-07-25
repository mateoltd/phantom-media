# Phantom Stream

Search a film or a series, then let the app work through its sources until one
of them actually plays.

Part of the [Phantom monorepo](../../README.md). Install from the root.

## What it does

- Searches open catalogs by title, IMDb link, TMDB URL or `movie:ID` / `tv:ID`.
  No API key and no account are involved at any point.
- Fills in artwork, ratings and synopses from Cinemeta, and episode listings
  from TVmaze.
- Resolves playback across a roster of sources, probes every manifest they
  offer before trusting one, and starts the fastest that answers.
- Hands off to the next source when one stalls mid-play, rather than dropping
  you back to a dead player.
- Puts failing sources on a cooldown so the next search does not spend time on
  them again.

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
  <kbd>F</kbd> for fullscreen, <kbd>0</kbd>–<kbd>9</kbd> to jump by tenths.
- Quality and subtitle menus, picture-in-picture, and fullscreen.
- Adaptive HLS through `hls.js`, native HLS where the browser has it, and
  progressive MP4 as the fallback.

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
