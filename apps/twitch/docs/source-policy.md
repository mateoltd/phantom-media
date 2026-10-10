# Anonymous upstream contracts and request policy

This replaces the investigation NEVER-INVOKE ledger using Round 4–15 behavioral
receipts and corrections. Investigation code is excluded as an implementation
reference. A sample establishes a contract, not unlimited coverage/request volume.

## Excluded automated paths

- Integrity/Kasada endpoints, challenges, Client-Integrity fetching/caching/plumbing.
- WatchTrack, reporting, mutations and userAuthorization/identity-token operations.
  Only approved Client-ID-only read operations belong in this client.
- Twitch after-cursor traversal for list families and replay. Reject locally;
  do not retry using another shape, transport, device header or batch.
- The terminal `search` field, Helix self operations and Client-ID-only Helix REST.
  This does not exclude `searchFor`: independent directed receipts captured on
  2026-10-10 verify its CHANNEL target with limit 40 anonymously. That distinct
  operation ships first-page-only; search cursors are excluded as well.
- Bulk ID scans/quota probes in production checks. Known-resource lookups are distinct.
- Terminated-account recovery, anonymous 4K and unverified members-only live playback.

Cursor restrictions are **not a global catalog-depth limit**. Finite sort/type/
language/period slices can discover older content. Still category-plan tokens
are app-owned, not Twitch cursors. Chat uses contentOffsetSeconds; verified offset
coverage does not prove completeness in arbitrarily crowded same-second windows.

## Request bounds

| Surface | Captured limits and axes |
| --- | --- |
| JSON-array POST | App maximum 35 documents; 35 accepted, 38 rejected; 36/37 unverified |
| Root aliases | 15 per document; count root aliases, not nested aliases |
| game.videos | first≤2500; TIME/VIEWS; lowercase single-language axis (literal String coercion; variables use [String!]) |
| user.videos | first≤100; TIME/VIEWS × ARCHIVE/HIGHLIGHT/UPLOAD/PAST_PREMIERE |
| user.clips | first≤100; LAST_DAY/LAST_WEEK/LAST_MONTH/ALL_TIME; TRENDING; no language |
| game.clips | first≤100; same periods; TRENDING; uppercase Language enum array |
| Top games | first≤100 |
| Root streams | first≤30; no verified root filter fanout; first page only |
| DirectoryPage_Game | limit≤100; slug plus required includeIsDJ/sortTypeIsRecency booleans; streams shelf |

Validate before sending. Oversized batches reject the whole envelope, delivering
no operations; accepted batches can have per-operation failures. videos(ids) does
not exist. Aliases batch known IDs; theoretical 525 slots are not a scan feature.
Game-video over-cap errors/data:null/literal null abort without upward retry.
Unexpected null below a valid cap is failure, not an empty catalog. Prefer 100–500
items interactively; 2000–2500 needs explicit background hydration and payload-aware
timeouts. Dedupe slices, record novelty per axis and expose finite coverage;
empty or overlapping axes never discard later types/languages/periods. Only
user.videos exposes totalCount. Clip and game-video totals are unavailable.
The independently captured catalog-totals.json receipt contains two rickyedit
HIGHLIGHT edges: sparse types are channel-specific, not categorically empty.

Batching is ordinary aggregation. Observed cursor-free successes are not a safe-rate
guarantee. Use cache-first discovery, bounded queues, coalescing, single attempts
and long family cooldowns. Never enqueue family retries after an integrity flag.
SideNav is not shipped without its request quartet and has no usable recorded continuation.

## Media and presentation contracts

- Keyless index-dvr supports completed and growing ARCHIVE. HIGHLIGHT/UPLOAD archive
  formulas failed and require separate strategies. PAST_PREMIERE has no path evidence.
- CDN playlists are media playlists. Path labels identify quality; Usher masters
  or sampled bytes supply real dimensions/codecs/bitrate. Preserve unknowns.
- Video ABR masters never contain audio-only stream entries. Require a video codec
  and resolution before synthesis; log omitted video keys without source URLs.
  Optional observed attributes match exact rendition locations. Missing attributes
  use a single media playlist, preserving keyless playback. Audio is explicit media
  delivery with no video dimensions/frame rate and no duplicated codec tokens.
- Completed etags were stable over 75 seconds; growing manifests require revalidation.
  Prefer etag when available. ENDLIST/live correlation/segment range inform lifecycle.
  EVENT and raw ID3-EQUIV-TDTG are not authority; PROGRAM-DATE-TIME owns wall-clock mapping.
- Ad-hoc muteInfo supplies official intervals. Unmuted-named in-window 111-byte stubs
  had zero AAC frames. Silent fallback preserves continuity; no original-audio claim.
  A 200 status alone does not prove usable segment media.
- Clip PAT needs platform/playerBackend/playerType. Sign videoQualities.sourceURL
  with sig/token. Do not depend on token clip_uri presence; frameRate is unreliable. Re-sign
  retains path/length, but resumed append still needs representation/Range validation.
- view_until, token expiry, signed-location expiry and CDN freshness are separate.
  Never persist raw tokens/signatures or log complete signed URLs routinely.
- Audio-only matches video EXTINF across 1519 segments; sampled AAC-LC is 48 kHz
  stereo. This is a coarse shared clock, not whole-file conversion certification.
- Snapshots verified four widths (320–1920) and changing live content. Offline authority
  is user.stream nullity; placeholder fingerprints are secondary and can rotate.
- Comment badges are message.userBadges {id version title imageURL}. Render those
  node fields; catalog joins are optional fallback. Filter Ozs= (base64 ;;) empty
  placeholders. Null userColor is valid and requires a default.
- Subscriber-only badges need source-specific restriction evidence; directory
  includeRestricted is discovery only. requestInfo country context stays internal.
- PubSub is excluded this release: proper 90-second LISTEN yielded zero MESSAGE.
  Later evaluation requires an active VOD/player-session event receipt.

## Wrong doors and counterparts

| Rejected selection/path | Counterpart or disposition |
| --- | --- |
| Ad-hoc video.moments / chapters | Pinned ChapterSelect operation |
| video.mutedSegments | Existing ad-hoc muteInfo |
| Clip REST download / downloads / mediaSecurityKey / assetLocations | videoQualities plus params-enveloped playbackAccessToken |
| Stream archive / restricted / previews | archiveVideo / source-specific diagnostics / previewImageURL |
| User profileBanner | bannerImageURL without width argument |
| Index-unmuted / index-muted / index-no-continue | quality/index-dvr; segment fallback is separate |
| Terminal search field / videos(ids) / clip VIEWS or LATEST | First-page searchFor plus login lookup / known-ID aliases / TRENDING |
| Native caption/subtitle fields in tested VOD shapes | No GraphQL or playlist caption contract. Broadcaster captions travel as CEA-608 data inside live and VOD video segments and the player decodes them; own ASR is a later product decision |
| Legacy v5 / api users, channels, videos | Closed legacy routes |
| Following/moderation, invented video lifecycle/owner fields, watchParty/communities/teamBySlug/teams/drop roots | Rejected investigated shapes; no anonymous inference or automated re-probing |

Persisted operations need versioned request quartets and per-op validators. Hash
degradation and variable-contract drift are distinct: Round 15 accepted the mute-alert
hash but rejected its variables. Keep it disabled/optional, with ad-hoc muteInfo primary.
Chapters/classification/viewcount have quartets. Other persisted operations need their
own quartet; raw operation adapters retain their owned selection shapes and fixture receipts. No runtime fishing.
