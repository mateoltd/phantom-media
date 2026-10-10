#!/usr/bin/env bash
# Reconciles each deploy/<app> branch with that app's latest release tag.
# Cloudflare Builds watches those branches, so advancing one is what ships that
# app to production.
#
# The script looks at the repository, not at the event that started it: every
# run brings every app to where it should be, so a missed or repeated event
# changes nothing. Branches only ever move forward. After moving one it waits
# for Cloudflare to report the build, so the run reflects what reached production.
set -euo pipefail

# Apps whose Worker is linked to Cloudflare Builds. Downloader is deployed by hand.
APPS=(twitch stream)
# The Worker each app's Cloudflare build reports as, in its GitHub check run.
declare -A WORKERS=([twitch]=phantom-twitch [stream]=phantom-stream)
BUILD_TIMEOUT=${BUILD_TIMEOUT:-1200}
BUILD_POLL=${BUILD_POLL:-20}
promoted=()
SEMVER='^[0-9]+\.[0-9]+\.[0-9]+$'
failed=0

fail() {
  echo "::error::$1"
  failed=1
}

# success | pending | missing | <failing conclusion>
ci_state() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$1/check-runs?check_name=verify" --jq '
    [.check_runs[] | select(.app.slug == "github-actions")] | sort_by(.started_at) | last
    | if . == null then "missing" elif .status != "completed" then "pending" else .conclusion end'
}

# success | pending | <failing conclusion>, for a build reported since $3
build_state() {
  gh api "repos/$GITHUB_REPOSITORY/commits/$1/check-runs?per_page=100" --jq "
    [.check_runs[] | select(.app.slug == \"cloudflare-workers-and-pages\" and .name == \"Workers Builds: $2\")
      | select(.status != \"completed\" or .completed_at >= \"$3\")] | sort_by(.started_at) | last
    | if . == null or .status != \"completed\" then \"pending\" else .conclusion end"
}

# Moving the branch only asks Cloudflare to deploy. Wait for its verdict so a
# failed production build fails this run instead of passing unnoticed.
await_builds() {
  local deadline=$((SECONDS + BUILD_TIMEOUT)) entry app sha since state
  local -a waiting=("${promoted[@]}") still
  while ((${#waiting[@]})); do
    still=()
    for entry in "${waiting[@]}"; do
      read -r app sha since <<< "$entry"
      state=$(build_state "$sha" "${WORKERS[$app]}" "$since")
      case $state in
        success) echo "$app: Cloudflare deployed ${sha:0:7}." ;;
        pending) still+=("$entry") ;;
        *) fail "$app: the Cloudflare build for ${sha:0:7} ended as $state. Production is unchanged; retry the build in Cloudflare." ;;
      esac
    done
    waiting=("${still[@]}")
    ((${#waiting[@]})) || break
    if ((SECONDS >= deadline)); then
      for entry in "${waiting[@]}"; do
        fail "${entry%% *}: Cloudflare reported no finished build within $((BUILD_TIMEOUT / 60)) minutes. Check the Worker's build history."
      done
      break
    fi
    sleep "$BUILD_POLL"
  done
}

reconcile() {
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
  if [[ $current == "$sha" ]]; then
    echo "$app: $branch is at $tag."
    return
  fi

  packaged=$(git show "$sha:apps/$app/package.json" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version')
  if [[ $packaged != "$version" ]]; then
    fail "$tag points at a commit where apps/$app is version $packaged."
    return
  fi

  if [[ -n $current ]] && ! git merge-base --is-ancestor "$current" "$sha"; then
    fail "$branch is not behind $tag. It was moved by hand or the latest release sits on an older commit; it will not be moved back."
    return
  fi

  state=$(ci_state "$sha")
  case $state in
    success) ;;
    pending)
      echo "::notice::$app: $tag is waiting for CI. This runs again when CI finishes."
      return
      ;;
    missing)
      echo "::warning::$app: no CI run found for $tag yet. Run CI on ${sha:0:7}, then run this workflow again."
      return
      ;;
    *)
      fail "$app: CI for $tag ended as $state, not deploying it."
      return
      ;;
  esac

  echo "$app: promoting $tag to $branch."
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if ! git push origin "$sha:refs/heads/$branch"; then
    fail "$app: could not move $branch to $tag."
    return
  fi
  echo "- \`$tag\` → \`$branch\` (\`${sha:0:7}\`)" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  promoted+=("$app $sha $since")
}

for app in "${APPS[@]}"; do
  reconcile "$app"
done
await_builds
exit "$failed"
