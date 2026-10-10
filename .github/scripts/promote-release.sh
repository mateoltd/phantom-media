#!/usr/bin/env bash
# Releases what main says should be released, once it is proven to build.
#
# A release is a version in a workspace's package.json that has no tag yet.
# Nobody tags by hand. This script creates the tag, and only on a commit that
# passed CI and, for a deployed app, that Cloudflare already built as a preview
# of main. A release that cannot build therefore never gets a tag: fix main and
# the same version goes out with the first commit that passes.
#
# Cloudflare Builds deploys an app to production from its deploy/<app> branch,
# so a tagged app then ships by moving that branch to the tagged commit.
#
# It acts on the state of the repository and of the checks on it, not on the
# event that started it, so running it again is always safe. Tags are never
# moved and deploy branches only move forward.
set -euo pipefail

# Deployed apps, and the Worker each one's Cloudflare build reports as.
declare -A WORKERS=([twitch]=phantom-twitch [stream]=phantom-stream)
APPS=(twitch stream)
# Versioned and tagged, but not deployed from here.
TAG_ONLY=(apps/downloader packages/config packages/theme packages/ui)
# What an app is built from besides its own directory.
SHARED=(packages package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json)

CHECK_TIMEOUT=${CHECK_TIMEOUT:-1200}
BUILD_TIMEOUT=${BUILD_TIMEOUT:-1200}
POLL=${POLL:-20}
SEMVER='^[0-9]+\.[0-9]+\.[0-9]+$'
building=()
failed=0
declare -A told=()

fail() {
  echo "::error::$1"
  failed=1
}

# Says something once, however many times the poll loop comes back to it.
tell() {
  [[ -n ${told[$1]:-} ]] && return
  told[$1]=1
  echo "$1"
}

field() {
  git show "$1:$2/package.json" | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).$3"
}

# success | pending | none | <failing conclusion>
ci_state() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$1/check-runs?check_name=verify" --jq '
    [.check_runs[] | select(.app.slug == "github-actions")] | sort_by(.started_at) | last
    | if . == null then "none" elif .status != "completed" then "pending" else .conclusion end'
}

# The latest build Cloudflare reported for commit $1 and Worker $2, ignoring
# any that finished before $3: success | pending | none | <failing conclusion>
build_state() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$1/check-runs?per_page=100" --jq "
    [.check_runs[] | select(.app.slug == \"cloudflare-workers-and-pages\" and .name == \"Workers Builds: $2\")
      | select(.status != \"completed\" or .completed_at >= \"$3\")] | sort_by(.started_at) | last
    | if . == null then \"none\" elif .status != \"completed\" then \"pending\" else .conclusion end"
}

# The newest verdict among commits, as "<state> <sha>". Checks land on the
# head of a push, so a later commit's verdict replaces an earlier one's.
latest() {
  local kind=$1 worker=$2 sha state
  shift 2
  for sha in "$@"; do
    if [[ $kind == ci ]]; then state=$(ci_state "$sha"); else state=$(build_state "$sha" "$worker" ""); fi
    if [[ $state != none ]]; then
      echo "$state $sha"
      return
    fi
  done
  echo "none -"
}

# Tags a workspace's version if it has none yet. Returns 2 while the checks it
# depends on are still running.
release() {
  local dir=$1 worker=${2:-} name version tag ci ci_sha preview sha
  local -a paths commits
  name=$(field origin/main "$dir" name)
  version=$(field origin/main "$dir" version)
  tag="$name@$version"
  [[ $version =~ $SEMVER ]] || return 0
  git rev-parse --verify --quiet "refs/tags/$tag" > /dev/null && return 0

  # Every commit on main since this workspace's build inputs last changed
  # builds the same thing, so a verdict on any of them counts. Newest first.
  paths=("$dir")
  [[ -n $worker ]] && paths+=("${SHARED[@]}")
  sha=$(git rev-list -1 origin/main -- "${paths[@]}" ':(exclude,glob)**/*.md')
  mapfile -t commits < <(git rev-list --first-parent --max-count=30 origin/main "^$sha^" 2> /dev/null || git rev-list --first-parent --max-count=30 origin/main)

  read -r ci ci_sha <<< "$(latest ci "" "${commits[@]}")"
  case $ci in
    success) ;;
    pending | none)
      tell "$tag: waiting for CI."
      return 2
      ;;
    *)
      fail "$tag: CI ended as $ci on ${ci_sha:0:7}. Fix main; $version is released by the first commit that passes."
      return 0
      ;;
  esac
  sha=$ci_sha

  if [[ -n $worker ]]; then
    read -r preview sha <<< "$(latest build "$worker" "${commits[@]}")"
    case $preview in
      success) ;;
      pending | none)
        tell "$tag: waiting for Cloudflare's preview build of main."
        return 2
        ;;
      *)
        fail "$tag: Cloudflare's preview build ended as $preview on ${sha:0:7}. Fix main; $version is released by the first commit that builds."
        return 0
        ;;
    esac
  fi

  echo "$tag: releasing ${sha:0:7}."
  git tag --annotate "$tag" --message "$tag" "$sha"
  if ! git push origin "refs/tags/$tag"; then
    git tag --delete "$tag" > /dev/null
    fail "$tag: could not push the tag."
    return 0
  fi
  echo "- released \`$tag\` at \`${sha:0:7}\`" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

release_all() {
  local deadline=$((SECONDS + CHECK_TIMEOUT)) entry code
  local -a waiting=("${TAG_ONLY[@]}") still
  for entry in "${APPS[@]}"; do
    waiting+=("apps/$entry ${WORKERS[$entry]}")
  done
  while ((${#waiting[@]})); do
    still=()
    for entry in "${waiting[@]}"; do
      code=0
      # shellcheck disable=SC2086
      release $entry || code=$?
      ((code == 2)) && still+=("$entry")
    done
    waiting=("${still[@]}")
    ((${#waiting[@]})) || break
    if ((SECONDS >= deadline)); then
      for entry in "${waiting[@]}"; do
        fail "${entry%% *}: its checks did not finish within $((CHECK_TIMEOUT / 60)) minutes, so it was not released. If Cloudflare never built main, check that the Worker builds non-production branches. Run this workflow again once they are done."
      done
      break
    fi
    sleep "$POLL"
  done
}

# Moves an app's deploy branch to its latest release.
promote() {
  local app=$1 branch="deploy/$1" prefix="@phantom/$1@"
  local version tag sha current packaged state since

  # Highest stable release whose commit is on main. Pre-releases never deploy.
  tag=""
  while read -r version; do
    [[ $version =~ $SEMVER ]] || continue
    sha=$(git rev-parse --verify --quiet "refs/tags/$prefix$version^{commit}")
    if git merge-base --is-ancestor "$sha" origin/main; then
      tag="$prefix$version"
      break
    fi
    echo "::warning::$prefix$version is not on main, ignoring it."
  done < <(git tag --list "$prefix*" | sed "s|^$prefix||" | sort --version-sort --reverse)

  if [[ -z $tag ]]; then
    echo "$app: no release yet."
    return
  fi

  current=$(git rev-parse --verify --quiet "refs/remotes/origin/$branch" || true)
  state=$(build_state "$sha" "${WORKERS[$app]}" "")

  if [[ $current == "$sha" ]]; then
    # The branch is right. Production is only right if its build succeeded.
    case $state in
      success | none) echo "$app: production is at $tag." ;;
      pending)
        echo "$app: $tag is building."
        building+=("$app $sha $(date -u +%Y-%m-%dT%H:%M:%SZ)")
        ;;
      *) fail "$app: the production build of $tag ended as $state, so production is on the previous release. This commit built as a preview, so retry the build in Cloudflare." ;;
    esac
    return
  fi

  packaged=$(field "$sha" "apps/$app" version)
  if [[ $packaged != "$version" ]]; then
    fail "$tag points at a commit where apps/$app is version $packaged."
    return
  fi
  if [[ -n $current ]] && ! git merge-base --is-ancestor "$current" "$sha"; then
    fail "$branch is not behind $tag. It was moved by hand or the latest release sits on an older commit; it will not be moved back."
    return
  fi
  if [[ $state != success ]]; then
    fail "$tag was not created by this workflow: Cloudflare has no successful build of ${sha:0:7}. Release the next version from main instead."
    return
  fi

  echo "$app: promoting $tag to $branch."
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if ! git push origin "$sha:refs/heads/$branch"; then
    fail "$app: could not move $branch to $tag."
    return
  fi
  echo "- \`$tag\` → \`$branch\`" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  building+=("$app $sha $since")
}

# Moving the branch only asks Cloudflare to deploy. Wait for its verdict so the
# run reflects what reached production.
await_builds() {
  local deadline=$((SECONDS + BUILD_TIMEOUT)) entry app sha since state
  local -a still
  while ((${#building[@]})); do
    still=()
    for entry in "${building[@]}"; do
      read -r app sha since <<< "$entry"
      state=$(build_state "$sha" "${WORKERS[$app]}" "$since")
      case $state in
        success) echo "$app: Cloudflare deployed ${sha:0:7}." ;;
        pending | none) still+=("$entry") ;;
        *) fail "$app: the production build of ${sha:0:7} ended as $state, so production is on the previous release. This commit built as a preview, so retry the build in Cloudflare." ;;
      esac
    done
    building=("${still[@]}")
    ((${#building[@]})) || break
    if ((SECONDS >= deadline)); then
      for entry in "${building[@]}"; do
        fail "${entry%% *}: Cloudflare reported no finished production build within $((BUILD_TIMEOUT / 60)) minutes. Check the Worker's build history."
      done
      break
    fi
    sleep "$POLL"
  done
}

release_all
for app in "${APPS[@]}"; do
  promote "$app"
done
await_builds
exit "$failed"
