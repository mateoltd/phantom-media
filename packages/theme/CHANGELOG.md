# @phantom/theme

## 0.2.1

### Patch Changes

- 1937ee3: Redesign playback controls as a compact charcoal surface consistent with the watch page. Choreograph the control reveal and dismissal, transition between the shared playback icons and buffering state in place, and animate seeking directionally. Use Phosphor return arrows at 95% of the standard icon size for seeking, with the 10-second interval in their tooltips and accessible labels. Keep seek icons mounted and visible, and replay directional feedback on every click or keyboard seek from the current animation position. Keep controls centered and respect reduced motion.
- 9955e87: Show focus outlines throughout Still and Stream only after Tab navigation, clearing them on pointer interaction; typing and playback shortcuts do not enable them.
- 3a5762a: Give the video the page on windows narrower than 1400px. The player now runs the full width of the frame and as tall as the window under the header allows, with the title and the action bar beneath it, instead of always leaving room for a chat column beside it. Chat starts closed at those widths and connects only once it is opened; from 1400px it still opens beside the video. Action labels open above the bar when it runs under the video.

## 0.2.0

### Minor Changes

- 9d37de9: BREAKING: Replace the liquid sleep timer picker with a standard sheet; `SleepTimerPicker` is now controlled through `open` and `onOpenChange`, and the `stage-sleep-liquid` styles are gone.
  
  Add scrub bar previews (`preview`, `onPreview`) with a muted-audio marker in the tooltip, a `small` search field size with an optional submit button and verified badges in results, a `quiet` select variant, and `loading`/`decoding` hints on artwork.
