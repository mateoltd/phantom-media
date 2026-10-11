# Still README artwork

Screens of the real local Still app, captured on 2026-10-11. Stream titles,
viewer counts, thumbnails and chat reflect the capture time. Twitch and
broadcaster artwork retain their respective ownership.

The compositions use Still's media tokens: `#191b1e` for the canvas,
`#101113` for frames, `#33363b` for edges, and `#f4f4f8` for text. Headlines
use the app's actual Sora font at weight 600. There are no eyebrow labels,
headline punctuation, invented browser controls, or status bars.

| Source | Route | Saved PNG |
| --- | --- | --- |
| `raw/player-desktop.png` | `/ow_esports` | 2880 × 1520 |
| `raw/home-desktop.png` | `/` | 2880 × 1500 |
| `raw/home-mobile.png` | `/` | 860 × 1864 |
| `raw/categories-desktop.png` | `/categories` | 2880 × 1760 |

Desktop captures freeze the rendered DOM, its actual CSS, loaded Sora font,
images, and (for playback) the current decoded video frame. T3's HTML renderer
exports the frozen page at 2× in two adjacent tiles, joined without rescaling.
Scripts, developer tools and content outside the captured area are omitted.
This preserves crisp UI text and controls rather than enlarging a smaller
screenshot. Video and thumbnails keep their upstream source resolution. Mobile
was captured directly at 2× with the collaborative browser.

The finished WebP files add minimal rounded frames and neutral shadows.
Screens are cropped to complete content rows and downsampled to fit the
composition. The original captures remain in `raw/`.

To rebuild the compositions, start Still once to populate its Next font cache,
then install Python's `Pillow` and `fonttools[woff]` packages and run:

```sh
python3 docs/screenshots/still/render_mockups.py
```

Outputs are `still-player.webp` (3200 × 2100), `still-discovery.webp`
(3600 × 2200), and `still-categories.webp` (3200 × 2380). Both READMEs use
relative links to these shared assets.
