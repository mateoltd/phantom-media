# Still README artwork

Fresh captures of the local Still app on 2026-10-11. Stream titles, viewer
counts, thumbnails and chat reflect the capture time. Twitch and broadcaster
artwork retain their respective ownership.

All desktop scenes use a standard **1920 × 1080 (16:9) viewport**, exported at
2× to **3840 × 2160**. All four finished compositions are **3200 × 1800 (16:9)**.
The complete desktop viewport is retained and scaled uniformly; the composition
script rejects desktop sources with a different aspect ratio. Mobile uses a
390 × 844 viewport captured directly at 2×.

| Source | Route | Saved PNG |
| --- | --- | --- |
| `raw/player-desktop.png` | `/ow_esports` | 3840 × 2160 |
| `raw/home-desktop.png` | `/` | 3840 × 2160 |
| `raw/categories-desktop.png` | `/categories` | 3840 × 2160 |
| `raw/home-mobile.png` | `/` | 780 × 1688 |
| `raw/player-mobile.png` | `/ow_esports` | 780 × 1688 |
| `raw/categories-mobile.png` | `/categories` | 780 × 1688 |

Desktop exports freeze the rendered DOM, current media frame, active CSS media
queries and viewport units at the actual capture dimensions. T3's HTML renderer
exports three adjacent 1280 × 2160 tiles, which are joined without rescaling.
The app's 16px root size, Sora and JetBrains Mono are explicitly preserved so
conversation theme defaults cannot change the interface's spacing or typography.
Capture checks verify loaded Sora faces, computed font family, root size, and
viewport geometry. The home search remains 896px wide and its heading 56px,
matching the live app at this viewport. The player uses a decoded 1080p frame.
Scripts, developer controls, and content wholly outside the viewport are omitted.

The compositions use Still's media tokens: `#191b1e` for the canvas,
`#101113` for frames, `#33363b` for edges, and `#f4f4f8` for text. Headlines
use Sora at weight 600, without eyebrow labels or headline punctuation. Frames
and neutral shadows sit outside the captured interface. There are no invented
browser controls or status bars.

To rebuild the compositions, start Still once to populate its Next font cache,
then install Python's `Pillow` and `fonttools[woff]` packages and run:

```sh
python3 docs/screenshots/still/render_mockups.py
```

Outputs are `still-player.webp`, `still-discovery.webp`, `still-categories.webp`,
and `still-mobile.webp`. Both READMEs use relative links to these shared assets.
