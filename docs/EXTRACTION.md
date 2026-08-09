# Extraction record

## Source checkpoint

This repository was extracted from the local `phantom` repository's
`monorepo` branch at source commit
`2be258e577ab028c05f8c112b9abfa9dc57f395a` on 2026-08-09.

The source working tree contained unrelated uncommitted Pervasivity, Matrix,
protocol, workspace, and documentation changes. The extraction used a fresh
local clone, so none of those uncommitted files were copied, changed, staged,
or committed.

## History method

The clone was filtered with `git-filter-repo` 2.47.0. The retained present-day
paths are:

- `apps/downloader`;
- `apps/stream`;
- `packages/config`;
- `packages/theme`;
- `packages/ui`;
- the workspace metadata required to install, verify, and deploy those paths.

Downloader existed at the source repository root before commit
`c8828036e6a6f3f23a7066a9ff7cfa0eca2b4f94` reorganized the project as a
monorepo. Its former root application, component, hook, library, public,
deployment, and configuration paths were also retained so `git log --follow`
with an explicit low rename threshold (for example,
`git log --follow --find-renames=20% -- apps/downloader/package.json`)
continues through that large rewrite. Commit hashes changed because filtering
rewrites trees, while authorship, timestamps, messages, ancestry, and relevant
file contents were preserved.

The former source `main` and `dev` tips are retained as
`legacy/downloader-main` and `legacy/downloader-dev`. The extracted media
monorepo continues on its own `main` branch.

## Dependency decision

Both applications import only three source-workspace packages:
`@phantom/config`, `@phantom/theme`, and `@phantom/ui`. Those packages are
copied into this repository and are now owned here. They are intentionally not
Git submodules, package links into another checkout, or remotely consumed
workspace packages.

Future changes may be copied deliberately between repositories, but neither
repository may require the other to install, test, build, or deploy. Divergence
is acceptable when the products' needs differ.

No Matrix, Instagram protocol, intelligence, evidence, or crawl-runtime source
path is present in the extracted working tree or package graph.

## Deployment and secrets inventory

### Downloader

- Next.js application plus a Cloudflare Worker and Container;
- Docker build context is the repository root because shared packages compile
  into the app;
- the container includes `yt-dlp`, FFmpeg, and the loopback PO-token provider;
- `EWYOUTUBE_PROXY_URLS` is a required Wrangler secret;
- all remaining runtime controls are documented in
  `apps/downloader/.env.example` and `apps/downloader/README.md`;
- the deployment uses the existing `ewyoutube` Worker name and
  `ewyoutube.com` custom-domain route.

### Stream

- Next.js application deployed to Workers through OpenNext;
- source resolver, optional Stremio manifests, takedown contact, debug flags,
  and explicit media-host allowlists are documented in
  `apps/stream/.env.example`;
- local configuration uses the existing `phantom-stream` Worker name;
- no custom production route is declared in its Wrangler file.

No secret value was copied into this repository. Populated `.env`,
`.env.local`, `.dev.vars`, credentials, Wrangler state, and build output remain
ignored.

## Verification and deletion gate

The extraction is technically independent only when all of these checks pass
inside this repository:

1. `pnpm install --frozen-lockfile`;
2. `pnpm check`;
3. `pnpm deployment:check`;
4. Downloader's Docker image builds in an environment with Docker available;
5. a repository remote and protected primary branch exist;
6. Cloudflare account access, Worker names, custom domains, environment values,
   and secrets are confirmed through the intended deployment pipeline;
7. both applications pass post-deployment health and smoke checks.

Only after the new repository is backed up remotely and the production checks
pass should a separate, reviewed change remove the original media paths. That
removal is deliberately outside this extraction checkpoint.

## Extraction verification performed

On 2026-08-09, the extracted tree passed:

- a frozen install with pnpm 10.13.1 across exactly six workspace projects;
- typechecking, linting, 222 Stream tests, and both Next.js production builds;
- Stream's OpenNext build and Wrangler dry run;
- Downloader's Worker/configuration dry run with its container rollout held;
- a real arm64 Downloader Docker image build from the repository root;
- a local container smoke check whose `/api/health` response reported the app
  and loopback PO-token provider healthy;
- checks confirming that no Matrix, Instagram protocol, or intelligence package
  is present in the current lockfile or source import graph.

No Cloudflare deployment occurred. Remote backup, account/secret/domain
verification, and post-deployment smoke checks remain open, so source deletion
is not yet authorized by this record.
