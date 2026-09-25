# Phantom Media

The monorepo for Phantom Downloader, Phantom Stream, and Phantom Twitch. Three apps,
one design system, one install, and no build-time dependency on the Pervasivity
intelligence repository from which this project was extracted.

| Package                | What it is                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `apps/downloader`      | Phantom Downloader pulls a video or a whole playlist down as a file.    |
| `apps/stream`          | Phantom Stream finds a film or series and plays it.                     |
| `apps/twitch`          | Phantom Twitch plays live channels and VODs.                            |
| `packages/theme`       | Design tokens, base layer and CSS primitives. Tailwind v4.              |
| `packages/ui`          | React components the apps share, consumed as source.                    |
| `packages/config`      | tsconfig, ESLint and PostCSS bases.                                     |

## Getting set up

```sh
corepack enable
pnpm install
```

Node 22 or newer, pnpm 10. Everything else comes from the lockfile.

## Working on it

```sh
pnpm dev                              # all apps
pnpm --filter @phantom/stream dev     # just one
pnpm --filter @phantom/twitch dev     # Twitch only
pnpm check                            # typecheck, lint, test and build everything
pnpm deployment:check                 # Worker/OpenNext dry runs, no deployment
pnpm container:build:downloader       # real Downloader image build
```

Turborepo fans tasks out across the workspace and caches what has not changed,
so a second `pnpm check` on an untouched tree finishes in seconds.

There is no dev server in the verification path on purpose: `pnpm check` is
what tells you the tree is sound.

## How the sharing works

All apps are Next.js 16 with React 19 and Tailwind v4, and pin the same
majors through the pnpm catalog in `pnpm-workspace.yaml`. A split there would
break `@phantom/ui`, which ships as TypeScript source and is compiled by
whichever app imports it. The apps’ `next.config.ts` files therefore include
`transpilePackages: ["@phantom/ui"]`.

Styling starts with the shared base. Each app's `globals.css` keeps the shared
Tailwind source scan and then loads the media surface appropriate to that app:

```css
@import "tailwindcss";
@import "@phantom/theme";
@import "@phantom/theme/media.css";
@source "../../../packages/ui/src";
```

Stream and Twitch add their additional cinema/player layers. The `@source`
line is not optional: Tailwind only ships classes it can find, and the shared
components live outside the app it is scanning.

Anything genuinely local stays local. The downloader keeps its locale-switcher
transition and its download/format workflows. All three apps now use the shared
media header, search field, artwork, and media surface. Stream and Twitch also
import `@phantom/theme/player.css` for shared video chrome; their playback
engines remain app-specific.

The theme also ships a dark media surface. `@phantom/theme/media.css` re-points
the palette variables to ink for all three apps. Stream adds
`@phantom/theme/cinema.css` for its catalog and watch pages. Downloader keeps
its download-specific layouts and queue state, while all apps use the shared
media shell. Stream and Twitch use `@phantom/theme/player.css` and player
controls from `@phantom/ui`. Twitch keeps its playback engine and chat behavior.

Phantom Twitch was imported from the separate `twitchsubonlybypass` checkout.
Its channel, VOD, and playlist routes remain local to that app; the source
checkout is unchanged.

## Design

Sora anchors the interface across all three apps. JetBrains Mono is limited to
the Phantom wordmark treatment and existing technical readouts. All three use
the shared dark media palette. The wordmark, search field, buttons, artwork,
media header, and media tiles come from `@phantom/ui`. Stream and Twitch also
use the shared player controls; app-specific catalog, channel, playback, and
download workflows stay with their apps.

## Deployment

All three apps have Cloudflare deployment configuration. Downloader uses a
Container; Stream and Twitch run as Workers through OpenNext. Deploy only the
apps intended for the current environment.

**Downloader** runs in a Cloudflare Container. It shells out to `yt-dlp` and
FFmpeg, so it needs a real filesystem and real binaries. The Worker in
`apps/downloader/cloudflare/worker.ts` caches immutable assets at the edge,
rejects junk routes there, and routes build-coupled HTML and dynamic download
APIs to the container.

```sh
pnpm deploy:downloader
```

The image builds from the workspace root because the app compiles against
packages that live outside its own folder. The `image_build_context` setting is
in `apps/downloader/wrangler.jsonc`.

**Stream and Twitch** run on Workers through OpenNext. Build each app, then
deploy its Worker with `wrangler --domain` and `NEXT_PUBLIC_BASE_URL` set to its
canonical HTTPS URL. Keep production hostnames in deployment settings rather
than this repository.

```sh
NEXT_PUBLIC_BASE_URL=https://your-host.example pnpm --filter @phantom/stream exec opennextjs-cloudflare build
pnpm --filter @phantom/stream exec wrangler deploy --domain your-host.example --var NEXT_PUBLIC_BASE_URL:https://your-host.example
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

This repository is licensed under the [MIT License](LICENSE). Third-party
software, assets, and services retain their own licenses and terms.

The apps are independent projects, affiliated with none of the services they
talk to, and neither hosts any media. Use them only for media you own, control,
or are legally authorized to access.
