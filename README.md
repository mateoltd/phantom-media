# Phantom Media

The standalone monorepo for Phantom Downloader and Phantom Stream. Two apps,
one design system, one install, and no build-time dependency on the Pervasivity
intelligence repository from which this project was extracted.

| Package                | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `apps/downloader`      | Phantom Downloader pulls a video or a whole playlist down as a file.    |
| `apps/stream`          | Phantom Stream finds a film or series and plays it.                     |
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
pnpm deployment:check                 # Worker/OpenNext dry runs, no deployment
pnpm container:build:downloader       # real Downloader image build
```

Turborepo fans tasks out across the workspace and caches what has not changed,
so a second `pnpm check` on an untouched tree finishes in seconds.

There is no dev server in the verification path on purpose: `pnpm check` is
what tells you the tree is sound.

## How the sharing works

Both apps are Next.js 16 with React 19 and Tailwind v4, and both pin the same
majors through the pnpm catalog in `pnpm-workspace.yaml`. A split there would
break `@phantom/ui`, which ships as TypeScript source and is compiled by
whichever app imports it. Both `next.config.ts` files therefore include
`transpilePackages: ["@phantom/ui"]`.

Styling is one import. Each app's `globals.css` is:

```css
@import "tailwindcss";
@import "@phantom/theme";
@source "../../../packages/ui/src";
```

That last line is not optional. Tailwind only ships classes it can find, and
the shared components live outside the app it is scanning.

Anything genuinely local stays local. The downloader keeps its locale-switcher
transition. The stream app pulls in `@phantom/theme/player.css` for video
chrome, and neither pays for the other's CSS.

The theme also ships a second surface. `@phantom/theme/cinema.css` re-points
the palette variables to ink, which repaints every primitive and every shared
component without any of them knowing about it. The stream app imports it
because its content is moving pictures; the downloader stays on paper.

## Design

One accent on a paper ground, Sora over JetBrains Mono, generous radii. The
search field is the same component in both apps: a pill, with a round icon
button rather than a labelled one. Every other surface in the system is
rounded, including panels, menus, rails and modals. A square field would have
been the only hard corner on the page, and the field is already the loudest
thing on a landing page without also shouting its own name.

## Deployment

Both apps go to Cloudflare, by different routes, because they need different
things.

**Downloader** runs in a Cloudflare Container. It shells out to `yt-dlp` and
FFmpeg, so it needs a real filesystem and real binaries. The Worker in
`apps/downloader/cloudflare/worker.ts` caches frontend responses at the edge,
rejects junk routes there, and wakes the container only for cache misses and
the dynamic download APIs.

```sh
pnpm --filter @phantom/downloader deploy
```

The image builds from the workspace root because the app compiles against
packages that live outside its own folder. The `image_build_context` setting is
in `apps/downloader/wrangler.jsonc`.

**Stream** is pure Next with no processes to keep alive, so it runs on Workers
directly through OpenNext.

```sh
pnpm --filter @phantom/stream deploy
```

For local work, copy an app's `.env.example` to `.env.local` in that same app
directory. For production, configure values through the target host. In
particular, the Downloader's Cloudflare deployment requires
`EWYOUTUBE_PROXY_URLS` to be provisioned with Wrangler as a Worker secret; do
not commit proxy credentials in an environment file.

The Downloader dry run uses `--containers-rollout=none`: it validates the
Worker and container binding without requiring Docker or publishing an image.
The separate container command validates the real image. Neither command
authenticates, provisions resources, uploads secrets, or proves that the
production account and custom domains are correctly configured. Those remain
explicit operator checks before the first deployment from this repository.

## Extraction provenance

This repository retains the media products' Git history, including Downloader's
pre-monorepo root history. The current shared `config`, `theme`, and `ui`
packages are owned here as independent copies so the two repositories can
evolve without a permanent cross-repository build dependency. See
[`docs/EXTRACTION.md`](docs/EXTRACTION.md) for the exact source checkpoint,
history method, dependency boundary, and deletion gate.

## Legal

Both apps are independent projects, affiliated with none of the services they
talk to, and neither hosts any media. Use them only for media you own, control,
or are legally authorized to access.
