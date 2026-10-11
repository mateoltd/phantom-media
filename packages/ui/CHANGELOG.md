# @phantom/ui

## 0.3.0

### Minor Changes

- 9955e87: Show focus outlines throughout Still and Stream only after Tab navigation, clearing them on pointer interaction; typing and playback shortcuts do not enable them.

### Patch Changes

- 2278bc8: Fix the player settings sheet collapsing to a sliver: it now attaches to the player frame once its options load, and in a narrow player beside chat the settings and sleep timer sheets use the frame's full height.
- 1937ee3: Redesign playback controls as a compact charcoal surface consistent with the watch page. Choreograph the control reveal and dismissal, transition between the shared playback icons and buffering state in place, and animate seeking directionally. Use Phosphor return arrows at 95% of the standard icon size for seeking, with the 10-second interval in their tooltips and accessible labels. Keep seek icons mounted and visible, and replay directional feedback on every click or keyboard seek from the current animation position. Keep controls centered and respect reduced motion.

## 0.2.0

### Minor Changes

- 9d37de9: BREAKING: Replace the liquid sleep timer picker with a standard sheet; `SleepTimerPicker` is now controlled through `open` and `onOpenChange`, and the `stage-sleep-liquid` styles are gone.
  
  Add scrub bar previews (`preview`, `onPreview`) with a muted-audio marker in the tooltip, a `small` search field size with an optional submit button and verified badges in results, a `quiet` select variant, and `loading`/`decoding` hints on artwork.
