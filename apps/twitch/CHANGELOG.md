# @phantom/twitch

## 0.2.0

### Minor Changes

- 8eda975: BREAKING: Watch history and resume positions move to new storage keys. Existing local history is not migrated.
  
  Rebuild Twitch playback around separate metadata and media resolution. Add native clip playback with continuous MP4 downloads, audio-only listening, cancellable TS/MP4 downloads, category browsing, channel and category video and clip libraries, official chapters, storyboard previews, chat replay with badges, colors and emotes, sampled chat search, and an extensions panel.

### Patch Changes

- Updated dependencies [9d37de9]
  - @phantom/ui@0.2.0
  - @phantom/theme@0.2.0

## 0.1.1

### Patch Changes

- Release through the preview-gated deploy pipeline. No functional change.
