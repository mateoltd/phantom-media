# Phantom

The monorepo behind the Phantom services. Two apps, one design system, one
install.

| Package                | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `apps/downloader`      | Phantom Downloader — pull a video or a whole playlist down as a file.    |
| `apps/stream`          | Phantom Stream — find a film or series and play it.                     |
| `packages/theme`       | Design tokens, base layer and CSS primitives. Tailwind v4.              |
| `packages/ui`          | React components both apps share, consumed as source.                   |
| `packages/config`      | tsconfig, ESLint and PostCSS bases.                                     |

## Getting set up

```sh
corepack enable
pnpm install
```

Node 22 or newer, pnpm 10. Everything else comes from the lockfile.

## Working on it

```sh
pnpm dev                              # both apps
pnpm --filter @phantom/stream dev     # just one
pnpm check                            # typecheck, lint, test and build everything
```

Turborepo fans tasks out across the workspace and caches what has not changed,
so a second `pnpm check` on an untouched tree finishes in seconds.

There is no dev server in the verification path on purpose: `pnpm check` is
what tells you the tree is sound.

## How the sharing works

Both apps are Next.js 16 with React 19 and Tailwind v4, and both pin the same
majors through the pnpm catalog in `pnpm-workspace.yaml`. A split there would
break `@phantom/ui`, which ships as TypeScript source and is compiled by
whichever app imports it — hence `transpilePackages: ["@phantom/ui"]` in both
`next.config.ts` files.

Styling is one import. Each app's `globals.css` is:

```css
@import "tailwindcss";
@import "@phantom/theme";
@source "../../../packages/ui/src";
```

That last line is not optional. Tailwind only ships classes it can find, and
the shared components live outside the app it is scanning.

Anything genuinely local stays local — the downloader keeps its locale-switcher
transition, the stream app pulls in `@phantom/theme/player.css` for video
chrome, and neither pays for the other's CSS.

## Design

One accent on a paper ground, Sora over JetBrains Mono, generous radii. The
search field is the same component in both apps and it is rounded, because
every other surface in the system is: panels, menus, rails, modals. A square
field would have been the only hard corner on the page.

## Deployment

Both apps go to Cloudflare, by different routes, because they need different
things.

**Downloader** runs in a Cloudflare Container. It shells out to `yt-dlp` and
FFmpeg, so it needs a real filesystem and real binaries. The Worker in
`apps/downloader/cloudflare/worker.ts` forwards every request to the container.

```sh
pnpm --filter @phantom/downloader deploy
```

The image builds from the workspace root — see `image_build_context` in
`apps/downloader/wrangler.jsonc` — because the app compiles against packages
that live outside its own folder.

**Stream** is pure Next with no processes to keep alive, so it runs on Workers
directly through OpenNext.

```sh
pnpm --filter @phantom/stream deploy
```

Copy each app's `.env.example` to `.env` before deploying, and keep proxy
credentials in the host secret manager rather than in a committed file.

## Legal

Both apps are independent projects, affiliated with none of the services they
talk to, and neither hosts any media. Use them only for media you own, control,
or are legally authorized to access.
