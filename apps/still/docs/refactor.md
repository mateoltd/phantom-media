# Twitch refactor implementation and validation

Backend implementation through Phase 8 is complete. The initial frontend was
rejected by the user and is superseded by the house-standard rebuild below.
Frontend acceptance remains the user’s decision. The temporary checklist is retired.
The resulting boundaries and source contracts are maintained in
[architecture.md](architecture.md) and [source-policy.md](source-policy.md).

The checkout was already dirty. Before reorganization, tracked/staged patches,
untracked files, hashes and relocation records were saved at
`/tmp/phantom-twitch-phase1-dbf_g4j6`; the starting HEAD was
`03c67297e2983a07484336c96a9738a4357ad1b8`. A second app checkpoint is at
`/tmp/phantom-phase2-u71le0oh`. Original app code and unrelated edits were
preserved. Investigation additions were attributed and independently replaced
from behavioral receipts, never used as implementation or test examples.

## Backend phases and cleanup

| Phase | Result | Cleanup before advancing |
| --- | --- | --- |
| 1: mechanical organization | Domain imports, upstream/query ownership and watch/chat/download lifecycles | Removed former entry modules and import barrels; audited 31 straightforward relocations against checkpointed bodies |
| 2: contracts and resolution | Metadata/media separation, keyless completed/growing ARCHIVE resolution, specialized non-archive strategies, freshness and silent-stub fallback | Removed investigation clients/parsers/tests/wiring, quality guesses, unused rate limiter and VOD POST input |
| 3: transport | Owned raw/persisted reads, bounded batches, per-op failures, deadlines, cancellation and family cooldowns | Removed duplicate transport/error aliases; pinned only usable persisted operations |
| 4: clips, audio and downloads | Native clip player, continuous Range downloads, audio-only mode and bounded HLS output | Removed unbounded ordered writes and silent file-saving restarts; separated expiry, cache freshness and representation identity |
| 5: sessions and libraries | Independent resource loading, finite sort/type/period/language slices, deduplication and honest coverage | Removed coupled catalog/metadata reads, unsupported live-root filters, root search and guessed live-VOD correlation |
| 6: replay and navigation | Rich offset replay, official chapters/mute intervals, independent storyboards and session chat search/reactions | Replaced flattened replay and investigation storyboard code; retained explicit same-second gaps and bounded indexes |
| 7: extensions | Nothing shipped; see [Extension catalog removal](#extension-catalog-removal) | Snapshot UI/API/polling and the extension catalog, collection API and receipts were removed after review |
| 8: integration | Canonical resource/history identities, server/browser ownership, shared byte/permit primitives, browser checks and durable documentation | Removed internal history adapters, legacy discovery GET, unused player props/helpers/exports and the temporary plan/ledger pointer |

Twitch source compatibility remains: non-archive CDN paths, independent Usher
fallback, recording-folder formulas, raw and pinned operation shapes, and muted
segment substitution. There are no app migration barrels or old-response/storage
adapters. History now uses `phantom-watch-history`; resume keys distinguish
`phantom-playback:vod:<id>` and `phantom-playback:clip:<slug>`. Older storage is
not read or migrated.

Fixed archive links include channel, stream ID and recording start. A stream ID
cannot enter a VOD ID field, and refreshing an archive playlist cannot select a
newer broadcast. Strict Mode startup cleanup cannot replace a clip deep-link
timestamp with zero. Source switches preserve loaded position, playing state
and speed; fatal player recovery is bounded.

## Earlier backend checkpoint validation

- `pnpm check`: all 15 workspace tasks passed, including Twitch typecheck, lint,
  109 tests and production build. Unused locals/parameters are enforced.
- `pnpm --filter @phantom/still exec opennextjs-cloudflare build`: passed.
- `pnpm --filter @phantom/still exec wrangler deploy --dry-run`: passed with the
  shared streaming media fast path. No deployment or commit was performed.
- `git diff --check`: passed. Removed-path/reference and unused-export audits
  found no remaining migration adapters or investigation modules.

The maintained original tests and independently designed boundary tests cover
media/manifest errors and fallback isolation, incomplete metadata, completed versus
growing freshness, batch/envelope failures, hash degradation, units, local caps,
terminal cursor/integrity policy, family cooldowns, cancellation and bounded bodies.
They also cover slice deduplication/stop budgets using the captured ID matrix,
Range/representation continuity, ordered HLS writes, rich badge/color shapes,
offset gaps, snapshot lifecycle and bounded extension references/redirects.
Tests do not perform external quota probes or reuse investigation tests.

Product-native browser checks used known resources and bounded reads:

- VOD `2895227665`: media readyState 4 at the requested 600-second offset,
  four chapters, rendered badge/emote images, synchronized seeks and storyboard
  navigation. Audio/video switches retained position, playing state and 1.5× speed.
- Live `strogo`: live video and read-only IRC loaded; its listed growing archive
  `2895857829` decoded and supported seeking and jumping toward the live edge.
- Clip `FaintCrazyEyeballMcaT-NQXM-eo18gDGQSDh`: `?t=5` opened at five seconds.
  Switching to 360p retained an eight-second position, paused state and 1.5× speed.
  The saved MP4 was 1,402,476 bytes, decoded at 640×360, and matched a served-file
  SHA-256 of `a7e932a8c5ad46e714df3ff00f4428d30390d5be7bc72434df0c84507bd6155e`.
  This exercised the Blob output path; direct-file writes, failure and cancellation
  are covered by fixtures, without claiming a native file-picker browser test.
- Category `Chess`: 200 videos and 100 clips loaded through independent slices.
- Snapshots: live 640×360 and expanded 1920×1080 frames decoded; an offline channel
  stopped image work through metadata. The controller's timing/visibility edge
  cases use injected-clock tests rather than prolonged external polling.
- Extensions: 20 catalog entries loaded. An independently collected Prime Gaming
  panel and public helper totaled 127,070 bytes. Its large main bundle exceeded
  the 2 MB file budget and remained an explicit partial-collection failure.
- Desktop 1440×900 and mobile 390×844 checks covered watch/chat, clips, history
  and navigation without horizontal overflow. Browser error/network review was
  supplemented with the fixture failure cases; no universal upstream reliability
  or full visual-regression baseline is claimed.

Browser screenshots are session artifacts under
`/home/day/.t3/userdata/browser-artifacts/`, including
`browser-screenshot-localhost-mv173q4x-3579e78f.png` (mobile clip),
`browser-screenshot-localhost-mv175ksq-8c3c90a4.png` (mobile VOD),
`browser-screenshot-localhost-mv176vhn-2c130402.png` (live channel), and
`browser-screenshot-localhost-mv1788u4-8ddce46f.png` (growing archive).
Check logs are session artifacts under `/tmp/phantom-{workspace,opennext,worker}-final.log`.
The retired checklist is retained outside production at
`/tmp/phantom-refactor-completed-plan-2026-10-09.md`.

## Evidence and remaining scope

Selected sanitized Round 13/15 receipts, request quartets and source hashes live
in [test/fixtures/research](../test/fixtures/research/README.md). Production
does not read investigation paths. Signed URLs, tokens and signatures are not
stored in those fixtures; opt-in player diagnostics omit URL queries.

Chapters, classification and UseViewCount are pinned; the mute-overlay variable
contract drifted and is disabled, with ad-hoc muteInfo primary. SideNav,
DirectoryGameRedirect and global cheer configuration are not shipped without
usable request quartets. Animated previews lack a decoded-media receipt and are
deferred. Rich activity/shared-chat states and nested moment tags lack captured
active-state shapes. PubSub is excluded after an acknowledgement without events.

ASR, MP3/M4A conversion, persistent chat
indexes, authenticated APIs and framework migration remain separate work. None
is an unfinished prerequisite for the shipped phases. Archive audio gaps remain
silence; catalog slices and crowded replay boundaries expose partial coverage.
PAST_PREMIERE is a valid catalog type without a verified specialized playback path.
The [source policy](source-policy.md) retains all terminal and never-invoke paths.

## Production audio ABR correction

The later user report for miraieta VOD `2895228400` added a missing acceptance
rule: audio must be excluded inside master synthesis, not only by its caller.
The [regression record](audio-abr.md) describes the video-only master, explicit
audio media path, normalized DTOs, safe keyless metadata fallback and independently
captured fixture. The maintained suite now has 121 passing tests. Real iPhone
Safari validation remains a device-specific acceptance step; Chromium playback
and mobile layout checks do not substitute for native Safari ABR.

## Frontend replacement and review fixes (9 October 2026)

The earlier page work was discarded as the implementation reference. Applicable
AGENTS.md, installed Next.js routing/client/CSS/image docs, the theme guide and
shared component inventory were read before replacement. New resource pages use
the existing media frame, Sora headings, JetBrains Mono numerals/timecodes,
theme colors/spacing, rounded panels, shared tiles/search/selects/buttons and
accessible dialogs. Recording tools now sit below the title rather than sharing
its horizontal row. Storyboards use a cropped canvas, 8 px inner frame, red pill
and the player’s shared scrub rail.

Catalog facts were verified from the Round 13 matrix, Round 14 caps and an
independent bounded known-channel capture. The capture returns two rickyedit
HIGHLIGHT entries, not zero; reported totals differ from fetched counts.
Scroll loading completes distinct axes sequentially without cursor continuation
or a global consecutive-empty abort. Default category plans include the measured
language axes; background game slices request 2000, interactive slices 200.
Totals are type-scoped user.videos counts; clips/game feeds remain partial.

Confirmed review regressions were corrected: Source segments above 8 MB stream
in order with disk backpressure; download preparation precedes a fresh Save
gesture; offline snapshots recheck metadata; prepaint hints use canonical
history storage. The old quality menu, download popover CSS, raw selects,
standalone range styling and global low-novelty abort were removed. No internal
legacy adapters were added. Native iPhone Safari ABR still requires a device
check; a Chromium mobile viewport does not validate Safari’s picker.

### Replacement verification

- `pnpm check` passed all 15 workspace tasks, including Twitch’s 121 tests,
  shared UI’s 7 tests, lint, typechecking and production builds.
- The final OpenNext Worker build and Wrangler deployment dry run passed.
  No deployment, staging or commit was performed.
- Production-browser checks at 1440×900 and 390×844 covered the replacement
  surfaces. Channel scroll loading advanced all eight selections automatically:
  19 videos loaded against a reported total of 22. The Highlights selection
  showed the two captured entries against its reported total of four.
- Shared select keyboard navigation restored focus to its control. The resource
  dialog trapped keyboard focus and returned it on Escape. The 360p clip download
  completed at 1,402,476 bytes through the Blob output path; native file-picker
  activation and large-segment backpressure are covered by boundary tests.
- VOD `2895228400` decoded at 1920×1080. Switching to explicit audio mode and
  back retained the paused 30-second position. Its storyboard canvas decoded
  at 220×124, with the 8 px frame and token-based mono timecode pill.
- The mobile snapshot page decoded a live `sodapoppin` frame at 640×360 and
  its channel avatar. Metadata-driven offline cards and the 20-entry extension
  catalog also rendered without horizontal overflow. Offline-to-live recovery
  is covered by an injected-clock test.
- Final whitespace and removed-reference checks passed. Earlier development
  console key warnings were corrected by namespacing the category page keys.

Check logs are `/tmp/phantom-refactor-{check,opennext,worker}.log`. Replacement
screenshots include `browser-screenshot-localhost-mv1ac3hs-1b005fbd.png`
(mobile recording tools), `browser-screenshot-localhost-mv1accyc-f9a4c058.png`
(mobile live snapshot), and `browser-screenshot-localhost-mv1acmmg-5b84f2ab.png`
(mobile extensions) under `/home/day/.t3/userdata/browser-artifacts/`.
These checks do not claim native Safari ABR validation or user acceptance of
the replacement frontend.

## Fresh seek-preview implementation

The user correctly identified that the replacement had moved frame browsing into
a disclosure and removed the seek-bar interaction. At the user’s direction, this
was implemented afresh, without restoring the investigation hook. The shared rail
now accepts media content and publishes preview times. Twitch owns descriptor
loading and sampled-cell selection; a single canvas renderer is shared with the
frame browser. Duplicate loading/drawing code and negative crop offsets were
removed. Descriptor and decoded-sheet caches are bounded, and cancellation
prevents an outdated frame from drawing.

An independent descriptor receipt for VOD `2895228400` is pinned at
`test/fixtures/storyboard.json`. Five new boundary tests cover coalescing with
caller cancellation, captured sheet boundaries, failed loads, descriptor body
limits and invalid/oversized geometry. The maintained suite has 126 passing
Twitch tests. All 15 workspace tasks and the OpenNext build passed.

Browser checks verified hover without seeking, pointer seek commitment, keyboard
seeking and blur cleanup. Rounded token-based previews use an 8 px image frame,
mono timecode pill and chapter/mute labels. At widths 320 and 390 the compact
preview remained within the player without horizontal overflow. Validation logs
are `/tmp/phantom-storyboard-{check,opennext,worker}.log`.

Late chapter/mute metadata also refreshes a stationary preview; it does not
require another pointer movement. No old hook or compatibility adapter was
restored. The production-mode preview decoded its 220×124 canvas while playback
remained paused at 30 seconds. No deployment was performed.

### Visual correction after user review

The user rejected the initial popup’s height, palette and hierarchy. Its revised
layout puts the frame first and time/chapter/status on a single compact row.
The timecode is neutral; a red pill is reserved for the typed muted interval,
with the full label retained in slider accessibility text. The surface, border
and text use the player’s stage tokens. The desktop popup measures about 145 px
high, down from 201 px; the compact 390 px layout measures 64 px. Browser checks
used both a normal interval and rickyedit’s verified mute window at 16700 seconds.
The renderer/loader were retained, without bringing back the investigation hook.
All workspace checks passed; frontend acceptance remains the user’s decision.

## User-directed playback UI corrections

The prior standalone recording tools and download modal were rejected. Audio
mode and direct-source quality selection now live in player StageSettings,
including clip quality. Chapters use a direct player menu with aligned mono
start times, active state, immediate seeking and focus restoration. Selection
preserves play/pause state. The independent frame browser and its CSS were
removed; scrub previews remain and have no border. Chat search and audience
reactions use heading controls inside ChatPanel and shared SearchField/Button
components. Replay no longer exposes the internal partial-boundary label.
Download uses the rail's attached quality/preparation/save picker with the
existing download hook; no modal or focus trap. The Save action remains a fresh
user gesture for browser output permissions. Share uses native sharing when
available, clipboard on desktop, and an attached selected-link fallback when
clipboard access fails. Middle-dot separators were removed from Twitch views.
The sleep picker is an immediate two-column preset grid on the stage sheet;
the unused liquid-gooey dependency and all animation-specific styling were
removed from the package and lockfile.

Bounded browser checks covered VOD 2895227665, four chapter rows, seeking to
1270 seconds without playing, audio/video switching at that position, the
in-chat 145-message search/reaction sample, successful clipboard copying and a
simulated denied-clipboard fallback with the full timestamped link selected.
At 390 and 320 pixel widths, player controls and the attached download picker
fit the frame/viewport. The clock occupies its own row on small frames and the
redundant player chat toggle is omitted there; the rail retains chat control.
The sleep grid opens immediately, selecting 30 minutes persists the deadline,
and Off clears it. Clip quality moved into settings, retained position at three
seconds, and switched to decoded 640x360 video. The attached picker saved the
360p MP4 through Blob output (1,402,476 bytes). Native file-picker interaction
was not verified in the preview environment. Browser checks do not claim native iPhone Safari verification.

Workspace validation passed all 15 check tasks. The final production build passed; production-preview checks confirmed
1920x1080 video, chapter selection/focus restoration and a borderless storyboard
contained within the 320-pixel player. User visual
acceptance remains pending; nothing has been deployed.

## Latest hierarchy corrections

The user superseded the previous chapter placement: chapters now sit below the
video as a compact horizontal rail, outside player settings. The category has
its own visible link alongside classification labels under the title. Chat
source tabs align with the channel avatar; smaller secondary search/reaction
controls and a 32-pixel shared search field replace the prominent submit pill.
The redundant close-chat button was removed. Download preparation remains an
attached picker, now on a flat token-based surface without a shadow. Muted
storyboard intervals use a muted-speaker icon instead of a red label. Sharing
copies directly, always includes `t`, and transitions to a checkmark for two
seconds. Obsolete chapter-menu properties and mute-pill styling were removed.

Browser checks confirmed direct copying of the 1270-second URL without invoking
native sharing, the 250-millisecond icon transition, paused chapter seeking to
7894 seconds, visible category context, and a borderless icon-marked muted
preview. At 320 pixels the preview measures 44 pixels high and stays inside the
player; chapter overflow is contained within its rail. Search and the shadowless
download picker fit without page overflow. Native iPhone Safari remains outside
the browser verification environment; touch inputs retain 16-pixel text to avoid
Safari focus zoom. Visual acceptance remains the user's decision.

All 15 workspace check tasks passed for these corrections, including the
production build. The refreshed local production preview decoded 1920×1080
video at 1270 seconds, confirmed optical heading/avatar alignment and the
12-pixel desktop search text, and retained the same layout at 390 pixels.
Validation log: `/tmp/phantom-hierarchy-check.log`. Nothing was deployed.

## Removal of rejected browsing surfaces

The user rejected the library filter box, circular header controls, Explore
modal, snapshot surface and extension dashboard. The replacement keeps media
primary: compact Videos/Clips controls, a quiet shared type/language selector,
a small title filter and secondary loaded counts. Per-slice coverage receipts
remain in application state and tests; they are no longer product markup.
Category browsing is a direct header link. Clips now place title, date and
download actions below the player. Notices use the app’s quiet text rhythm.

Extensions load only when their flat navbar button is opened. The attached
non-modal panel has a searchable list, a detail step, explicit collection/cancel
and saving controls. Back navigation restores the selected row’s focus; Escape
returns focus to the trigger. Outside click or keyboard focus leaving the panel
dismisses it. Panel dimensions use the header’s container width to fit narrow
viewports. The shared quiet selector retains arrow/Home/End/Escape navigation;
its portal coordinates account for the root’s reserved scrollbar gutters.

Removed the snapshot wall, polling hook/controller, snapshot API, standalone
extensions page and their unused styles/tests. Ordinary live card thumbnails
remain; captured snapshot fixtures remain research evidence. Removed routes
return 404 without aliases or migration adapters. Extension collection backend
contracts and tests remain. All 15 workspace check tasks passed, including the
production build (`/tmp/phantom-browse-ui-check.log`).

Final browser validation ran against the production preview after the shared
preview host disconnected. Channel and category controls support keyboard
selection, including Home/End/Escape, without clipped portal menus. Extension
search, detail/back focus restoration, Escape dismissal and a simulated bundle
Save gesture passed. One real bounded Prime Gaming collection had already
returned two files and one unavailable file. The navbar panel and library fit
320/390-pixel viewports. Clip playback decoded video and its title/actions sit
below the frame; the clip also fits at 390 pixels. Home browsing made zero
snapshot API requests. Removed routes/API returned 404. No page errors were
recorded. Logs: `/tmp/phantom-browse-ui-browser.log`; screenshots:
`/tmp/phantom-browse-{channel-desktop,extensions-desktop,extensions-320,extensions-390,category-desktop,clip-desktop}.png`.
The last clip cleanup removed a duplicate player frame and passed typecheck,
lint and production build. Nothing was deployed; visual acceptance is the
user's decision.

## Independent end-to-end review

Three read-only subagents reviewed the complete tracked and untracked changes,
including moved implementations against HEAD. Their scopes covered backend
contracts/routes/media/output, frontend/shared UI/theme, and catalogs/chat/history
plus cross-app configuration and cleanup. All actionable findings were addressed
and the reviewers checked the fixes:

- Discovery continuation is a bounded, validated, stateless category plan that
  survives Worker isolate changes. Malformed/expired plans return local 400
  responses without making an upstream request.
- Live master/media reads now use validated destinations/redirects, byte limits,
  cancellation and deadlines while retaining nested Twitch CDN compatibility and
  partial LL-HLS support.
- Live/VOD/Usher playback and download preparation resolve relative media paths
  against the final redirect URL. A redirected 304 retains the cached body while
  updating its base URL and supplied validators.
- Shared dropdowns preserve trigger-relative Tab/Shift+Tab order and keep Escape
  from dismissing a parent modal. Chat tool dismissal restores the correct button.
- Explicit `t=0` overrides stored resume for VODs and clips. Missing/invalid
  timestamps remain distinct; duplicate clip timestamp inputs do not crash.
- Removed the old `/?v=` redirect, unused discovery heading helper and stale
  storyboard documentation.

Final `pnpm check`: 15 successful tasks, including 131 Twitch tests, with no
failures. Log: `/tmp/phantom-review-final-check.log`. Collaborative browser checks
confirmed dropdown and chat focus, VOD/clip zero-time resume, real 1920-pixel VOD
video, audio-position continuity and the narrow attached download picker. The
restarted production preview also passed library/extension keyboard checks and
VOD zero-time playback with a saved 800-second resume. Native iOS Safari and the
downloader's complete batch dialog were not exercised; nested Escape behavior
was checked through its actual document-listener boundary. No deployment made.

## Extension artwork and packaging follow-up

Independently captured `iconURLs.square100` from the anonymous catalog and a
successful PNG fetch in `test/fixtures/extensions/icon-request.json`. Catalog
and image version paths differ, so supplied URLs are preserved. Shared Artwork
renders compact list/detail logos with a fixed-size puzzle fallback; optional
icon-field schema failures degrade to the basic catalog without retrying
integrity failures. Backend and frontend reviewers found no actionable issues.

Browser checks confirmed 17 loaded logos and three missing-image fallbacks in
the current catalog, a 40px detail logo, and unchanged dimensions after an image
error. At 390px the menu fits within the viewport. The open menu raises the
header above the homepage's sticky search, resolving an overlap found during
verification. `pnpm check` passed all 15 tasks. A clean OpenNext build and
Wrangler dry-run passed for the latest changes; the earlier skip-build attempt
had reused an incompatible ordinary Next build. LAN preview was refreshed. No
deployment made; native iPhone Safari acceptance remains outstanding.

## Ranked search follow-up

Replaced the exact-only search implementation with the shared bounded index,
ranking, public identity adapter and progressive hook documented in
`architecture.md`. Removed the obsolete exact-only function and result DTO.
Pinned a new independent two-channel identity receipt under
`test/fixtures/search`; no research implementation was consumed.

Three reviewers checked backend contracts, client interaction and ranking/
cleanup. Their findings were resolved and checked again: cached observations
cannot resurrect a newer missing-channel receipt, visible live labels expire
without typing, same-tab history changes are read on opening, and hidden
matches survive Escape for ArrowDown/Enter. No actionable findings remain.

`pnpm check` passed 15 tasks and 142 Twitch tests. The final hook adjustment
also passed lint, a clean OpenNext build and Worker dry-run. Local benchmark:
1,991 candidates, 500 mixed queries, median 1.02ms and p95 4.71ms for ranking.
A controlled browser input-to-known-result check measured 0.9ms; these local
measurements are not network latency or a universal performance guarantee.

Production-preview browser checks verified `rub` and `rubuis` find Rubius,
Escape/ArrowDown reopens, Enter after dismissal chooses Rubius, an unfamiliar
Day9tv lookup subsequently supports partial `day9`, and a pasted Twitch channel
URL navigates directly. Controlled response fixtures verified out-of-order
request cancellation, history removal changing affinity order and same-query
live-label expiry. The shared mobile search results fit within 390px. The LAN
preview was refreshed; no deployment made. Partial search coverage remains
bounded to seeded, publicly discovered and locally known channels.

## Ambiguous search intent follow-up

Pinned an independent three-channel receipt for `illo`, `illoju` and IlloJuan.
Added public follower/partner observations with a separate seven-day freshness
clock. Short ambiguous names weigh bounded popularity; exact long names,
explicit usernames and recent local familiarity retain stronger intent signals.
No channel-specific ranking overrides or UI changes were introduced.

All three reviewers checked the changes. The backend review found raw cached
responses acquiring new observation timestamps; hydration now caches normalized
receipts with their original sampling times. Stale-positive and stale-negative
regressions pass, and the reviewer confirmed the fix. No actionable findings
remain.

`pnpm check` passed all 15 tasks and 150 Twitch tests, including 17 search tests.
Clean OpenNext build and Worker dry-run passed. Local ranking at 1,991 candidates
measured 1.13ms median and 5.03ms p95; this excludes network latency.
The production preview verified `illo` and `illoju` rank IlloJuan first,
ordinary Enter opens IlloJuan, and `@illo` ranks and opens the smaller exact
account. Test fixtures also cover a recent visit preferring the smaller account,
long specific usernames and unrelated popular channels. LAN preview refreshed;
no deployment made. These weights are heuristics, not measured intent accuracy.

## Query-driven candidate coverage

Replaced roster-only retrieval with a new adapter for the distinct public
`searchFor` field. Four independent request/response fixtures verify a CHANNEL
target with limit 40 for `rubius`, `ricky`, `apple` and `illo`; ordinary small
accounts appear alongside established creators. The terminal `search` field
remains excluded. No investigation implementation, cursor traversal or challenge
credentials were consumed.

Server responses retain the full candidate pool for private browser history
ranking. Query-scoped upstream matches preserve semantic relevance without
leaking into unrelated queries. Normal inputs fetch candidates alongside bounded
identity hydration; explicit usernames use only exact identity lookup. Both
sources cache their original sampling times. Optional identity schema fallback
shares the whole hydration's 1.5-second deadline. No styling changed.

All three reviews completed. Fixed the backend finding that successful empty
discovery could hide failed exact identity hydration; the converse partial-error
regression now passes. Usable results survive one failed source, while failures
cannot masquerade as successful empty searches. Reviewer client checks covered
semantic expiry, intent cache separation and private-history reranking.

`pnpm check` passed 15 tasks and 158 Twitch tests, including 25 search tests.
Clean OpenNext build, Worker dry-run and diff whitespace check passed. Production
preview returned 40 candidates and rendered eight suggestions for `rubius`,
`ricky` and `apple`, including small accounts. API round trips measured 414,
439 and 477ms respectively in this local check. Explicit `@ricky` used one
identity result, retained exact-first ordering and passed Escape/ArrowDown.
The 420px results viewport scrolls without extending beyond the page viewport.
A reviewer measured local ranking at 2,000 entries/40 semantic candidates:
median 1.64ms, p95 3.52ms. These are sample timings, not universal guarantees.
LAN preview refreshed; no deployment made. Coverage is a bounded first page,
not a claim to enumerate every matching account.

## Channel page and catalog redesign

Superseded for the channel and category libraries: slice plans, cross-slice
deduplication, coverage receipts, the title filter and loaded counts are gone.
A view (media, type, sort, period, language) is exactly one slice of 100, read
once and kept for the life of the page. `user.videos` without a `type` returns
every kind together, which is the default view. "Show more" reveals rows that
are already loaded. Nothing loads on scroll.

The channel page is rendered by the server from the cached channel read, and
the default view streams into the same response, so the browser makes no
request for either. A cached copy older than 30 seconds is rechecked once in
the browser and only redrawn when the broadcast changed. The former server
block below the player is now the About tab, always present in the HTML.


## Search latency and complete-result follow-up

Ordinary search now starts with the independently pinned native autocomplete
contract, which supplies avatar, live/offline state and verification together.
The richer 40-candidate search pool follows without blocking it. A page-load
identity warmup and bounded local observed-channel persistence provide immediate
known results. Text-only name hints are no longer selectable suggestions.

Avatars are normalized to the rendered 50px source and decoded before eligibility;
visible images use eager loading and synchronous decode. Completed rows publish
individually. Failed images and exhausted queues settle to a short fallback,
including queue time within the 250ms image deadline. Native autocomplete has a
total one-second shared-load deadline; broad discovery has a total 1.5-second
one. Source relevance deadlines survive cached rereads unchanged. Empty quick
results cannot hide a failed richer lookup. Cold plain Enter keeps search open
until usable results arrive; explicit usernames and content links remain direct.

Browser input-to-first-complete-row measurements on the LAN preview: ricky 26ms,
rubius 75ms, repeated orange 5ms. An independently cold silver lookup on the final
build took 332ms (native response 262ms; richer response 748ms). No incomplete
avatar/status frames were observed in these checks. Cold external lookups still
incur Twitch/network latency; these samples are observations, not latency guarantees.
Keyboard review covered cold Enter, Escape then Enter, reopening and selection;
shared non-search Artwork retained its lazy/async defaults.

Final `pnpm check` passed all 15 tasks and 170 Twitch tests, including queue
saturation, transport-queue cancellation, semantic expiry and independent row
publication regressions. A concurrent catalog rewrite updated its stale tests
before this successful check. Full OpenNext build and Worker deployment dry-run
passed; the LAN preview was restarted. No deployment was made.

## Extension catalog removal

The user dropped extensions on 10 October 2026: a 20-entry global catalog and a
base64 export of static files served no viewer. Earlier sections describe that
surface as it was validated; none of it ships now. Removed the navbar menu and
its styles, `lib/extensions/`, the catalog/viewer operations and their request
family, both `/api/extensions` routes, the reserved `extensions` channel name,
the tests and `test/fixtures/extensions/`.

Running a channel's extensions in the player was checked and not pursued.
Anonymous reads do return a channel's active extensions with viewer tokens, but
the hosted pages and Twitch's supervisor frame both restrict `frame-ancestors`
to Twitch origins, so embedding would need a rewriting proxy and an owned
replacement for the supervisor.
