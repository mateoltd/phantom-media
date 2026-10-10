# Still application boundaries

Routes translate HTTP input and output. Domain operations own upstream shapes;
components consume pure application contracts. Direct imports keep server, browser
and pure dependencies visible. There are no migration barrels or legacy response
adapters.

| Owner | Responsibility |
| --- | --- |
| `lib/twitch/` | Owned Client-ID reads, transport policies, pinned persisted operations and response normalization |
| `lib/playback/` | VOD, fixed archive and clip resolution; CDN/Usher strategies; freshness and sanitized diagnostics |
| `lib/media/` | Destination validation, bounded body reads, manifest revalidation, HLS rewriting and streaming proxy |
| `lib/catalog/` | Views and the single bounded slice behind each one, source-specific axes and canonical keys |
| `lib/chat/` | Rich messages, read-only IRC, offset replay lifecycle and bounded session indexes |
| `lib/previews/` | Historical storyboard geometry and bounded loading |
| `lib/downloads/` | Download preparation, ordered streaming HLS, Range file transfers and abortable output sinks |
| `lib/discovery/` | Source selection, recommendation ranking and app-owned category expansion |
| `lib/history.ts` | Canonical resource identities and browser persistence; no legacy storage adapters |
| `lib/cache.ts`, `lib/concurrency.ts` | Bounded/coalesced resource caches and cancellation-safe request permits |
| `components/` | Matching domain views and React lifecycle adapters; player hooks remain cohesive |
| `app/` | Pages, validation, status/error mapping and response cache policy |

`playback/data.ts`, `contracts.ts` and catalog contracts are pure application DTOs. Raw Twitch types stay beside their operations. A stream ID
is never a VOD ID: fixed archive references include channel, stream ID and recording
start. Channel lookup resolves that reference once; its playlist URLs retain it.
Only VOD/clip identities enter history. Positions are broadcast-relative for VODs
and clip-local for clips; missing clip parent/offset information stays absent.

Metadata can survive unavailable media. Optional chapters/classification load
separately from playback. Replay, standalone seeking and storyboard browsing use
known duration when video is unavailable. Chapters and chat timestamps issue the
same seek command; audio/video share the verified coarse archive clock.

Seek previews use the shared rail’s optional media slot and absolute-time
notification. The rail owns pointer capture, keyboard focus, labels, exact
timecodes and popup positioning; preview notifications never seek. Twitch’s
adapter renders only when the sampled cell changes. Descriptor loading is lazy,
coalesced across consumers, capped at 256 KB and revalidated after 30 seconds.
Caller cancellation detaches from the shared request. One canvas component crops
explicit source coordinates and retains at most four decoded sheets within an
eight-million-pixel cache budget. Compact container layouts keep the preview
inside small players. Frame errors leave the timecode and seek control available.
Visual priority is frame, neutral timecode, then secondary chapter text. Typed
muted intervals show the muted-speaker icon; stage colors own the popup.

## Upstream boundary

`gql.ts` supports owned raw reads, pinned persisted reads and explicit batches.
It validates document count, root aliases, variables, page limits and byte/deadline
budgets before sending. Accepted batch failures stay per-operation; rejected
whole envelopes deliver no mapped results. GET is restricted to the verified
UseViewCount contract. Discovery sends one attempt and coalesces/cache reads;
ordinary metadata can retry transport failures within three attempts. Integrity
and rate errors flag families and stop queued family work.
Discovery continuation carries a validated, size-limited remaining category
plan with a ten-minute expiry, so another Worker isolate can continue it.
Malformed or expired app plans are local validation failures, never upstream
integrity errors. Each expansion still requests only a category's first shelf.

The registry pins chapters, classification and view counts to Round 15 quartets.
Hash/shape degradation makes optional resources unavailable. Chapters have no
working raw-query counterpart. Ad-hoc muteInfo remains primary; the persisted
mute overlay is disabled because its variable contract drifted. SideNav and
DirectoryGameRedirect are not shipped without usable request quartets.

See [source policy](source-policy.md) for allowed surfaces, caps and exclusions.

## Media and output

Completed and growing ARCHIVEs resolve keyless first. Specialized original
HIGHLIGHT/UPLOAD paths remain, with independent Usher fallback. Keyless quality
labels do not imply observed resolution/codec/bitrate. Synthetic HLS bandwidth
hints are explicit estimates; observed Usher attributes remain distinct.

Video master synthesis admits only renditions with observed video codec and
resolution; it excludes audio even when incoming labels/dimensions are wrong.
Codec tokens are deduplicated. Audio DTOs carry `isAudioOnly: true`, the name
`Audio Only`, and no video dimensions/frame rate. Explicit audio mode serves a
media playlist, with no audio stream in the video ABR ladder.

Optional Usher attribute observation has a 2.5-second total deadline, a bounded
five-minute success cache and a 30-second failure cache. It matches exact
rendition locations and preserves keyless delivery. If attributes are absent,
video serves one direct media playlist; VODs retain manual selection among known
video path identities. Neither guessed codecs/dimensions nor audio enter ABR.
When the browser decodes an otherwise unknown Source rendition, its observed
height labels that rendition in player settings and downloads, for example
`1080p (Source)`. These observations stay client-side and belong to the selected
rendition; they do not fill resolver attributes or master entries. Frame rate
remains absent unless observed from the source metadata. Direct-media playback
has no duplicate Automatic/Default choice.
See the [audio ABR regression record](audio-abr.md).

Completed manifests use a 30-second freshness window and conditional revalidation;
growing manifests revalidate without a freshness window. ETag takes precedence
over Last-Modified. Resolver freshness is 30 seconds for complete resources and
5 seconds otherwise. Clip metadata, token expiry and signed-location cache
freshness are separate; signed responses are no-store.
Live playlists use the same destination and redirect validation, with a 512 KB
body limit and a fifteen-second deadline. They remain uncached and accept empty
or partial LL-HLS media shelves independently of the archive parser.

The proxy forwards Range and representation validators without buffering normal
media. Unmuted candidates with inaccessible responses or 111-byte stub
representations use silent fallback, dropping original validators. This preserves
playback continuity and never recovers original audio. `worker.js` runs the same
proxy directly for GET and HEAD; OpenNext handles other requests.

HLS downloads retain initialization/range information and reject unsupported
assembly. Ordered network chunks await disk backpressure without retaining whole
Source segments; a 64 MB transfer cap guards individual segments. Preparation
resolves the container and recording window before a separate Save gesture opens
the file picker, before any network await. Growing downloads are captured windows.
Direct file saving aborts failed
writes; other browsers have a 256 MB Blob limit. File continuation after signing
refresh checks source identity, total length, validators and an initial byte
sample. Output is TS or MP4; there is no MP3/M4A conversion.

## Bounded optional resources

Libraries request deterministic sort/type/period/language slices, never Twitch
cursors. They retain at most 2,000 items and 48 slices, with an 8 MB cumulative
receipt budget checked after each bounded slice. Novelty is recorded per
type/period/language axis: overlapping or empty shelves do not starve later
axes. Budget, errors and plan exhaustion stop the finite plan. Scroll reveals
24 retained items at a time, then loads the next slice sequentially with a
750 ms pause; an accessible Show more control is also available.

Channel plans start ARCHIVE-TIME, ARCHIVE-VIEWS, then remaining types.
Category plans cover the fixture-backed 14 VOD and 11 clip language axes plus
unfiltered shelves. Clip plans visit all periods, including ALL_TIME, before
language fanout can consume the session budget. Interactive game slices use 200 items; explicit background
plans use 2000 (cap 2500). Channel/clip slices use 100. Only user.videos has a
reported total: sum its per-type total once, never per ranking. Clip/game totals
remain unavailable. Loaded order is not globally chronological pagination.
Search covers loaded titles. Known-ID alias grids (35 documents × 15 aliases)
are a documented background option, never scroll work or guessed-ID scanning.

Chat indexing is on demand, session-only, capped at 10,000 messages and six
pages per action. Panel retention stays separate. Same-second replay boundaries
are partial; sampled audience activity is relative to the loaded baseline.

Live channel cards use their ordinary preview images. The snapshot wall, polling
controller and snapshot API were removed after user review. Captured snapshot
receipts remain research evidence only.

## Investigation disposition

Investigation modules, tests and wiring were checkpointed, attributed and removed
or independently rewritten. Their code is not a reference implementation. Durable
inputs are sanitized behavioral receipts and verified operation contracts in
`test/fixtures/research/`. The temporary plan is replaced by this document
and the [implementation/validation record](refactor.md).

## View ownership

Category and clip pages use the existing media frame and app stylesheet.
`/categories` is one server-read request: the hundred most watched categories,
the first three each as a row of box art beside a carousel of their top streams. The page has no field of its
own: the header search suggests categories everywhere, and on `/categories` it
leads with them and a plain submit becomes `?q=`, answered by Twitch's category
search. `?game=` reads the category's figures and its opening Live view
together, so the browser asks for nothing until a tab, sort or language changes.
A name Twitch does not have falls back to the same search. Live streams reuse the
home feed's tile; a category's Live view is the `game-streams` catalog slice.
Libraries use compact Videos/Clips buttons, the quiet shared StyledSelect variant
and a small title filter above MediaTile results. Loaded counts are secondary;
per-slice receipts stay in state for validation rather than product markup.
The old Explore modal and the extension catalog were removed. Navbar tools use
flat icon controls; categories navigate directly.
Clips place their title/date/actions below the player. Shared SearchField,
StyledSelect, MediaTile, Button, ChannelAvatar and rails remain the UI inventory. The player owns audio mode
and quality through StageSettings. Chapters live
below the video as a compact horizontally scrolling rail with mono start times
and an active state; selection preserves play/pause state. The VOD category links
to category discovery alongside content labels under the title. Classification
labels are omitted when category context is unavailable. The storyboard appears
only on the seek rail, with no independent frame
browser or popup border. The sleep picker uses the stage sheet and immediate
preset buttons; no animation dependency remains. ChatPanel owns search and
reactions through its secondary heading controls. Its compact search uses the
shared SearchField without a submit button. Source tabs align with the channel
avatar; message, tool and footer insets share one rhythm. Chat visibility belongs
to the action rail and player, with Escape retained for keyboard dismissal.
Download preparation and saving use the
rail's flat attached picker, never a modal. Sharing copies directly to the
clipboard, always appends the playback timestamp and transitions to a checkmark
without changing button dimensions. A selected link input is the fallback when
copying is unavailable.
Explicit URL timestamps, including zero, override stored resume positions for
both VODs and clips. Only an absent or invalid timestamp selects resume state.
RecordingPosition reuses ScrubBar for unavailable recordings. Storyboard crops
use canvas dimensions and
shared tokens for their frame and neutral monospace timecode; muted intervals
show a muted-speaker icon while slider accessibility text retains the full label.
There are no inline layout styles. The bounded chat stylesheet carries only
validated Twitch user-color
data; typography and fallback presentation stay in twitch.css.

Shared Modal portals to the body, traps keyboard focus and restores the trigger
on dismissal. Mobile layouts use the same tokens and spacing rhythm. History
prepaint hints and React hydration both read the canonical resource storage and
exclude clips from channel-shortcut counts.

Watch history has no page of its own. The header's history button opens a panel
over the current page (`components/history/HistoryMenu.tsx`) that lists what is
stored, removes single entries or all of them with an undo, and pauses recording. Every
write goes through `lib/history.ts`, which announces it, so the home page and
search stay in step with the panel. The panel itself makes no request beyond
the bounded metadata backfill for entries saved without details.

## Ranked channel search

Search has three independent layers: `lib/search/ranking.ts` owns deterministic
matching, `service.ts` owns public candidate collection and bounded identity
hydration, and `client.ts` plus `use-search.ts` own local ranking and progressive
UI updates. Both runtimes use the same index implementation, bounded to 2,000
channels. It precomputes normalized login/display names, handles accents and
separators, and retains only the top eight matches. Exact, prefix, word,
substring and bounded typo matching outrank category/title clues. Short ambiguous
name matches weigh logarithmically bounded follower counts and partner status
alongside spelling. Longer exact names, explicit @usernames and recent personal
visits preserve specific intent. Live status and viewers provide small bonuses;
being offline does not erase a creator's durable popularity. These are heuristics,
not calibrated intent probabilities. No follower counts are fabricated.

The bootstrap roster contains name hints, not asserted channel existence or
live state. Query-driven `searchFor` retrieves up to 40 CHANNEL candidates from
one public first page, including ordinary offline accounts and Twitch's context
matches. This is distinct from the terminal `search` field in the research ledger;
four independent directed response fixtures pin the working contract. The full
pool reaches the browser so private history can promote candidates outside the
server's first eight. Upstream relevance is query-scoped, expires with that query
cache and cannot create generic recommendations for unrelated words.

Native `SearchTray_SearchSuggestions` is the ordinary-query fast path, with its
own pinned quartet fixtures. It supplies avatars, live/offline state and observed
verification in one response; text-only nodes are excluded. It starts after 30ms.
The richer 40-candidate `searchFor` pool follows after 250ms without delaying first
results. Explicit @usernames use only exact identity hydration. Successful usable
rows survive a failed source; once both settle, an empty success cannot hide the
other source's error. Autocomplete has a total one-second deadline, including
transport queue time; broader sources have 1.5-second deadlines and single attempts.
No terminal search field, cursor, challenge, integrity-token or guessed-name scan
is used. Integrity cooldowns remain terminal within each operation family.

Both mounted searches share a page-load warmup that hydrates the bounded known
roster once, rather than waiting for a keystroke or directory request. Existing
discovery and selected identities also expand the index. Observed candidates are
stored locally (256 max), while query strings are not persisted. Coverage remains
partial: one first page is not every matching Twitch account.

Only rows with fresh known state and a decoded avatar (or settled fallback) are
selectable. Name hints cannot appear early and fill in later. Avatar preloads use
the same 50px URL as rendered rows, coalesce across thumbnail sizes and have a total
250ms deadline, including queue wait. Failures and budget exhaustion settle to a
short-lived fallback. Visible search images load eagerly and decode synchronously. Each complete row
publishes independently, so a slower sibling cannot block it. No secondary
metadata request blocks an ordinary first row.

Quick and expanded receipts share a 64-entry, 30-second read cache. Each source
retains its original relevance deadline, including on cached rereads. Late quick
responses cannot remove expanded candidates. Missing-channel receipts carry
observation times so late responses cannot undo newer evidence. Server hydration
caches normalized receipts with original sampling times; optional popularity
falls back to basic identity only on schema errors. Live state and autocomplete
verification expire independently after 120 seconds; follower/partner observations
after seven days. Active search schedules expiry invalidations and reopening
recomputes freshness. Ready hidden matches remain available for keyboard reopening.

Watch-history affinity follows every change to the stored history, in this tab
or another, deletions included; it never leaves the browser. Up to 48 selected channel
identities are stored locally for later name matching. Query strings are not
persisted. Pasted channel URLs and explicit @usernames navigate directly; VOD
and clip links retain their dedicated routes.
