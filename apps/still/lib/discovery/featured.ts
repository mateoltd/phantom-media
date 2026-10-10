/**
 * Long-lived, well-known channels used as crawlable entry points into the
 * indexable `/[channelName]` pages, and as hub pages under `/videos`.
 *
 * Static on purpose: neither the build nor sitemap generation may depend on a
 * live Twitch lookup, so this list is verified by hand rather than fetched.
 *
 * A channel that is renamed, banned, or never existed returns a real 404, so a
 * stale entry here becomes a broken internal link. Re-verify this list if the
 * site has been up a while. `test/featured-channels.test.mjs` guards the
 * structural invariants that are checkable offline.
 */
export const FEATURED_CHANNELS = [
  { login: "ninja", label: "Ninja" },
  { login: "shroud", label: "Shroud" },
  { login: "xqc", label: "xQc" },
  { login: "jynxzi", label: "Jynxzi" },
  { login: "tenz", label: "TenZ" },
  { login: "auronplay", label: "Auronplay" },
  { login: "kisstv", label: "Kisstv" },
  { login: "emiru", label: "Emiru" },
] as const;
