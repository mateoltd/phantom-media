# Media layout and sizes

`src/tokens.css` owns the shared sizes. `src/media.css` supplies the container
and styles consumed by `@phantom/ui`. Still uses this contract for home,
channel, watch, history, and informational pages.

## Content frame

Use `className="media-content"` on a top-level content container. Its content
width is `100% - 2 × gutter`, with no fixed desktop maximum. Surfaces can opt
into a cap using `--media-content-max-width` (100% by default).
The gutter is `--navigation-gutter` plus a 24px inset, reduced to 12px at 640px
and below. At viewport widths of 390px, 1440px, and 1920px, the content insets
are 20px, 45.6px, and 48px respectively. Still also reserves equal scrollbar
space on both viewport edges when the platform uses non-overlay scrollbars.

Use `<MediaHeader contentAligned />` to align navigation to that frame. Do not
nest another `media-content` inside it: keep internal text readable with a
`max-width` on the prose itself. A full-width background or divider can wrap
the container.

The Still player starts below the header at the frame's left edge. Its title
shares that edge, and its height-constrained video keeps a responsive space for
expanded chat. Opening chat expands the sidebar to fill the remaining frame
without moving the video. The sidebar reserves 20% of the frame (336–512px),
then absorbs any extra width left by the video's height limit.

## Spacing and type

The `--space-N` scale uses `N × 4px`: available steps are 1–8, 10, 12, 14, and
18. Use the semantic tokens for repeated media elements:

| Token | Default | Responsive variant |
| --- | --- | --- |
| `--media-grid-column-gap` | 24px | 18px at ≤900px |
| `--media-grid-columns` | 4 | 1 at ≤640px, 2 at ≤1000px, 3 at ≤1399px, 6 at ≥3000px |
| `--media-grid-row-gap` | 28px | 24px at ≤640px |
| `--media-heading-gap` | 24px | 18px at ≤640px |
| `--media-heading-height` | 40px | Same |
| `--media-font-section` | 26px | 23px at ≤640px |
| `--media-font-page-title` | 25.6–36px | Fluid with viewport width |
| `--media-font-player-title` | 16–20px | Fluid with viewport width |
| `--media-font-card-title` | 14px | Same |
| `--media-font-card-meta` | 13px | Same |
| `--media-font-badge` | 12px | Same |
| `--media-card-line-height` | 1.4 | Same |

Still maps the shared `MediaTile` styling hooks (`--media-tile-title-size`,
`--media-tile-meta-size`, `--media-tile-badge-size`, and
`--media-tile-line-height`) to these tokens. Its caption starts 12px below the
artwork with no horizontal inset; metadata starts 4px below the title. Badges
sit 12px inside the artwork with 4px × 8px padding. Other apps retain the shared
component's existing defaults unless they opt into these hooks.

## Element variants

| Token | Size | Purpose |
| --- | --- | --- |
| `--media-thumbnail-ratio` | 16:9 | Live, VOD, and history artwork |
| `--media-thumbnail-compact-height` | 84px | Continue-watching reminder |
| `--media-avatar-shortcut` | 28px | Channel shortcut pill |
| `--media-avatar-control` | 36px | Player action rail/byline |
| `--media-avatar-fallback` | 46px | Missing-artwork fallback |
| `--media-avatar-profile` | 56px | Offline channel header |
| `--media-avatar-profile-large` | 72px | Channel about header |

Grid column counts can differ by surface. Compact reminders and profile
headers deliberately use their named variants rather than the standard card
or control size. Image `width`, `height`, and `sizes` attributes are loading
hints; the CSS token controls the rendered dimension.
