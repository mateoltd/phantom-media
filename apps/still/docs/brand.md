# Still

Still is the product name. Phantom Media is the collection it belongs to; the
existing Phantom mark appears with “Part of Phantom Media” in the footer.
Twitch remains a descriptive reference to the supported platform. The package is
`@phantom/still`, and new release tags use `@phantom/still@<version>`. Historical
`@phantom/twitch` tags remain unchanged.

The app lives in `apps/still`; its stylesheet, UI classes, transition names,
and search component use Still naming. App-level contracts use domain names
such as `ChannelData` and `LiveStream`. The `lib/twitch` adapter and Twitch
protocol names describe the upstream service.

Cloudflare Builds must use `/apps/still` as its build root and watch `apps/still/**`
alongside shared packages and workspace dependency files. The production branch
`deploy/twitch` and Worker name `phantom-twitch` remain external deployment
identifiers. The release workflow maps the Still app to them explicitly and reads
its package name from `apps/still/package.json`.

Browser storage keys and media proxy response headers retain their existing
identifiers to preserve preferences, history, resume positions, and cached-client
compatibility. Upstream `lib/twitch` modules, API routes, shared `@phantom`
packages, and the Phantom Media repository name keep their existing meaning.

## Design

The concept answers Twitch's [official Glitch icon](https://brand.twitch.com/)
with stillness: a flat, wide pebble and two horizontal resting eyes. The shape
has no speech tail, angular outline, extrusion, or purple brand treatment.
The mark is original geometry. The wordmark is outlined Sora SemiBold with
simplified upright `i` and `l` stems; it does not require a font to render.
Sora is the app's existing font, licensed under the SIL Open Font License.

This is a visual differentiation strategy, not a trademark clearance opinion.
Neither the name nor the symbol has undergone a comprehensive trademark search;
an opposite concept or parody alone does not establish freedom to use a mark.

## Assets

- `public/still-mark.svg`: transparent 64 × 64 symbol; the eyes are cutouts.
- `public/still-logo.svg`: 169 × 64 horizontal lockup with outlined lettering.
- `app/icon.svg`: symbol on the app's dark background, with PNG and ICO exports
  beside it for browser and home-screen compatibility.
- `public/still-social.svg`: editable 1200 × 630 social card, exported as `og.png`.

The primary fill is warm white (`#f4f2eb`) on ink (`#101113`). For light surfaces,
use ink for the entire mark and retain the transparent eye cutouts. The navbar
lockup’s eyes slowly narrow to thin, visible lines and quickly reopen on a
12-second cycle; reduced-motion preferences keep the resting expression.
Initial channel, video, and clip loading uses a page-wide screen centered below
the navbar. Loading states use a gently breathing mark with visible resting eyes and a
staggered trail of rising Zs. This loop indicates ongoing activity, not a completion
percentage; measured download and watch progress retain their progress tracks.
Reduced-motion preferences show the sleeping mark and Zs without animation.
Keep other uses still, without shadows, speech tails, or gradients.
Keep clear space of at least 8 units on the
64-unit mark grid. The header uses the lockup at 38px high, within a 44px
home-link target; the symbol also works at 16px for a favicon.
