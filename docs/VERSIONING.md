# Versioning

Every workspace in `apps/*` and `packages/*` is versioned independently with
[Semantic Versioning 2.0.0](https://semver.org). The repository root is not a
released thing and carries no version.

All workspaces started at `0.1.0`. Versions are never edited by hand: they
change only when [Changesets](https://changesets.dev) applies a changeset.

## Choosing a bump

While a workspace is on `0.y.z`, SemVer allows anything to change at any time.
We hold a tighter line:

| Change                                             | On `0.y.z` | From `1.0.0` |
| -------------------------------------------------- | ---------- | ------------ |
| Breaking change to the workspace's public contract | minor      | major        |
| New backwards-compatible capability                | minor      | minor        |
| Bug fix, performance, internal refactor            | patch      | patch        |
| Docs, tests, CI, tooling with no shipped effect    | none       | none         |

Never pick `major` on a `0.y.z` workspace. Going to `1.0.0` is a deliberate
decision that the contract is stable, made on its own, not a side effect of a
breaking change.

A breaking change on `0.y.z` is a minor bump, and its changeset summary starts
with `BREAKING:` so the changelog says so.

### What the public contract is

- **Apps** (`@phantom/still`, `@phantom/stream`, `@phantom/downloader`): what
  a user or operator relies on. URLs and routes, API route shapes, persisted
  client state (local storage, watch history), and required environment or
  deployment configuration. Removing a route, changing stored data without a
  migration, or requiring new configuration is breaking.
- **Packages** (`@phantom/ui`, `@phantom/theme`, `@phantom/config`): what the
  apps import. Exported components, props, design tokens, and config entry
  points. Removing or renaming an export, or changing a prop or token in a way
  that makes a consumer change its code, is breaking.

### Dependents

When a package is released, every workspace that depends on it gets a patch
bump automatically, so an app's version always changes when what it ships
changes. If the app needed its own code changed to adopt the package, list the
app in the changeset with the bump that change deserves.

## Workflow

1. **With the change**, run `pnpm changeset`. Select the workspaces whose
   shipped behaviour changes, pick each bump from the table, and write a
   one-line summary in the imperative, aimed at whoever reads the changelog.
   Commit the generated `.changeset/*.md` file with the code.
2. A change with no shipped effect still records that on purpose:
   `pnpm changeset --empty`.
3. **To release**, run `pnpm release:version`. It consumes the pending
   changesets, bumps each `package.json`, and writes each workspace's
   `CHANGELOG.md`. Commit the result as `chore(release): version packages`
   and push it to `main`. That is the whole release: there is nothing to tag
   and nothing to deploy by hand.

CI runs `pnpm version:check` on every pull request and fails when a workspace
changed without a changeset.

## Releases and production

A version on `main` that has no tag yet is a pending release. The `Deploy`
workflow turns it into a real one, and it only does so on a commit that is
already proven:

1. Every push to `main` runs CI, and Cloudflare builds it as a preview. A
   preview is a full build of the Worker that is not sent to production.
2. When both have passed, the workflow tags the workspace at that commit.
3. For Still and Stream it then moves the app's `deploy/<app>` branch to the
   tagged commit. Cloudflare Builds deploys production from that branch, so
   this is what ships. The workflow waits for that build and reports it.

Still lives in `apps/still`, with package and release tags named `@phantom/still`.
The release script maps Still to the existing `deploy/twitch` branch and
`phantom-twitch` Worker. Cloudflare Builds must use `/apps/still` as its root and
watch `apps/still/**`; update the external build configuration when moving the app.
Promotion reads the package name from its manifest. Existing `@phantom/twitch`
tags remain historical records.

Production therefore only ever receives a commit Cloudflare has already built
once. Packages and Downloader are tagged after CI alone: packages reach
production through the patch bump they give each dependent app, and Downloader
has no linked Worker and is deployed by hand with `pnpm deploy:downloader`.

The workflow runs whenever CI finishes on `main`, and on demand from the
Actions tab. It acts on the state of the repository, not on the event that
started it, so running it again is always safe.

### When a release does not build

Nothing is lost, because nothing was tagged. The version is still pending.
Push the fix to `main`; the same version is released by the first commit that
passes CI and builds as a preview. There is no version to burn and no branch
to touch.

The `Deploy` run says which check failed and on which commit.

### Other cases

- **The production build fails after the preview passed.** The same commit
  already built, so this is Cloudflare, not the code. Retry the build from the
  Worker's build history. Runs stay red until it succeeds, so it cannot be
  missed.
- **A bad release is live.** Roll the Worker back to its previous deployment in
  Cloudflare, which takes effect immediately, then ship the fix as a new
  release. Deploy branches are not moved back.
- **Cloudflare never builds `main`.** The Worker must have builds for
  non-production branches enabled. Without them a release waits, then fails
  saying so.

GitHub enforces two rules independently of the workflow: `deploy/*` branches
reject force pushes and deletion, and `@phantom/*` tags cannot be moved or
deleted once pushed.

## Tags

One tag per released workspace, in the form `<package name>@<version>`, for
example `@phantom/still@0.2.0`. Tags are created only by the `Deploy`
workflow. A tag pushed by hand on a commit Cloudflare has not built is refused
for deployment.

## Pre-releases

Use SemVer pre-release identifiers through Changesets' pre mode
(`pnpm changeset pre enter next`, then `pnpm changeset pre exit`), giving
versions such as `0.3.0-next.0`. Do not hand-write suffixes. Pre-release
versions are not tagged or deployed.
