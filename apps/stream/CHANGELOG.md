# @phantom/stream

## 0.1.3

### Patch Changes

- 1937ee3: Redesign playback controls as a compact charcoal surface consistent with the watch page. Choreograph the control reveal and dismissal, transition between the shared playback icons and buffering state in place, and animate seeking directionally. Use Phosphor return arrows at 95% of the standard icon size for seeking, with the 10-second interval in their tooltips and accessible labels. Keep seek icons mounted and visible, and replay directional feedback on every click or keyboard seek from the current animation position. Keep controls centered and respect reduced motion.
- 9955e87: Show focus outlines throughout Still and Stream only after Tab navigation, clearing them on pointer interaction; typing and playback shortcuts do not enable them.
- Updated dependencies [2278bc8]
- Updated dependencies [1937ee3]
- Updated dependencies [9955e87]
- Updated dependencies [3a5762a]
  - @phantom/ui@0.3.0
  - @phantom/theme@0.2.1

## 0.1.2

### Patch Changes

- Updated dependencies [9d37de9]
  - @phantom/ui@0.2.0
  - @phantom/theme@0.2.0

## 0.1.1

### Patch Changes

- Release through the preview-gated deploy pipeline. No functional change.
