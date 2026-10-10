# Audio-only exclusion from video ABR

The user reported blank video on iPhone Safari for miraieta VOD `2895228400`:
the synthesized master exposed a cheap AAC-only rendition as 1080p video.
Native adaptation could select that rendition without any video track. The
refactor's caller filtered audio, but the generator itself still accepted it;
its audio test asserted absent dimensions rather than absent stream entries.

## Contract and implementation

- Master synthesis excludes audio independently of caller filtering. Positive
  audio codec evidence overrides fabricated labels/dimensions. Video requires
  both a video codec and resolution; missing attributes are diagnosed by key.
- Resolve audio entries have `kind: "audio"`, `isAudioOnly: true`, name
  `Audio Only`, the observed audio codec/bandwidth when available, and no
  resolution/frame rate. Codec lists never duplicate a sample type.
- `master.m3u8?vodId=2895228400` has exactly one stream entry with
  `CODECS="avc1.64002A,mp4a.40.2"`, 1920×1080, 60 fps and bandwidth 6,398,154.
  Audio is 218,597 bps and cannot appear in this ladder or its video menu.
- `master.m3u8?vodId=2895228400&mode=audio` serves the selected audio media
  playlist. It has media segments and zero `EXT-X-STREAM-INF` entries.
- Usher attribute observation is optional, bounded and matched by actual
  rendition location. CDN URLs remain keyless. When observation fails, the
  video presentation selects one video media playlist without synthesized
  attributes; explicit manual quality selection remains available for VODs.
  Its redirect pins the media URL so later attribute availability cannot change
  a growing-playlist poll into a master response.
- The player receives audio mode explicitly and hides video quality choices
  while listening. The master contains no dangling `VIDEO` group references.
  HLS rendition/group semantics follow [RFC 8216 §4.3.4.2](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.4.2).

The fixture in [test/fixtures/audio-abr](../test/fixtures/audio-abr/README.md)
is independently captured from this exact VOD. Regression cases cover the
resolved pair, whole-list synthesis, explicit audio delivery, fabricated video
attributes on AAC, duplicate codec tokens, missing video attributes, metadata
failure fallback and identity-safe attribute matching.

## Verification and device boundary

All 15 workspace checks pass, including 121 Twitch tests, typecheck, lint and the Next
production build. OpenNext bundling and the Worker deploy dry run pass; no
deployment occurred. Browser HTTP checks confirmed the
normalized pair, exactly one video stream, the expected codec string and a
direct audio media response. The browser decoded video at 1920×1080 with
readyState 4 at the requested 30-second offset. Audio/video switching retained
position and paused/playing state. The video quality menu listed only Automatic
and 1080p60; audio mode offered speed controls without video quality choices.

The available collaborative browser is Chromium. An iPhone viewport is a layout
check and does not exercise Safari's native ABR. Real-device acceptance remains:

1. Open this VOD on iPhone Safari with default video mode and constrained network.
2. Confirm video frames render and the fetched video master has one AVC/AAC entry.
3. Toggle audio-only, verify audio continues through its media playlist, then
   return to video and confirm position and video frames are retained.

The code change is local; no production deployment or real-iPhone verification
is claimed by this record.
