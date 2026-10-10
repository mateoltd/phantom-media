# VOD 2895228400 audio ABR regression

Independent capture of the user-reported miraieta VOD, 9 October 2026. The
original Usher master has a 6,398,154 bps AVC/AAC 1920×1080 rendition at 60 fps
and a 218,597 bps AAC-only rendition. The lower bitrate must never be a choice
in Phantom's video ABR master.

`usher-master.m3u8` retains captured stream attributes. CDN URIs are replaced
with deterministic unsigned fixture locations preserving video/audio identity.
`metadata.json` retains the VOD ID, owner, type, date and duration; title/locator
are replaced. `provenance.json` records capture time, source hash and redactions.
No signed URLs, signatures or playback tokens are retained.

Tests drive metadata, CDN resolution, optional observed attributes, synthesis,
audio media delivery and malformed mislabeled audio without external requests.
