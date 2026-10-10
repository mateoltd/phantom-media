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

- **Apps** (`@phantom/twitch`, `@phantom/stream`, `@phantom/downloader`): what
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
   `CHANGELOG.md`. Commit the result as `chore(release): version packages`.
4. Run `pnpm release:tag` on that commit, then `pnpm release:push`. It pushes
   `main` and the new tags together, so the release either arrives whole or
   not at all.

CI runs `pnpm version:check` on every pull request and fails when a workspace
changed without a changeset.

## Production deploys

Production follows release tags, not `main`. Cloudflare Builds deploys each app
from its own branch: `deploy/twitch` and `deploy/stream`. Downloader has no
linked Worker: it is versioned like the others but deployed by hand with
`pnpm deploy:downloader`.
Each branch is a pointer to the commit that app has in production. They are
meant to lag behind `main`, and nobody pushes to them by hand.

The `Deploy` workflow moves them. It does not act on the event that started it:
every run compares each app's latest release tag with its deploy branch and
closes the gap, so a missed, repeated, or out-of-order event changes nothing.
It runs when an app tag is pushed, when CI finishes on `main`, and on demand.

An app's branch moves to its latest release only when all of these hold:

- The tag is a stable version. Pre-releases never deploy.
- The tagged commit is on `main`.
- `apps/<app>/package.json` at that commit carries the tag's version.
- CI passed on that commit. A release tagged before CI finishes waits for it.
- The move is a fast-forward. A branch is never moved back.

Only the tags of those two apps deploy. A package release reaches production through the patch
bump it gives each dependent app.

GitHub enforces two of these independently of the workflow: `deploy/*`
branches reject force pushes and deletion, and `@phantom/*` tags cannot be
moved or deleted once pushed.

### When something goes wrong

- **A release did not deploy.** Open the latest `Deploy` run: it says, per app,
  whether it is waiting for CI, blocked, or already current. Fix the cause and
  run the workflow again from the Actions tab.
- **The branch moved but production did not change.** The Cloudflare build
  failed. Retry it from the Worker's build history.
- **A bad release is live.** Roll the Worker back to its previous deployment in
  Cloudflare, which takes effect immediately, then ship the fix as a new
  release. Deploy branches are not moved back.
- **A tag was pushed on the wrong commit.** It cannot be removed. Release the
  next version; the workflow always takes the highest one.

## Tags

One tag per released workspace, in the form `<package name>@<version>`, for
example `@phantom/twitch@0.2.0`. Tags are created only by `pnpm release:tag`
and are never moved or deleted; the repository rejects both.

## Pre-releases

Use SemVer pre-release identifiers through Changesets' pre mode
(`pnpm changeset pre enter next`, then `pnpm changeset pre exit`), giving
versions such as `0.3.0-next.0`. Do not hand-write suffixes.
