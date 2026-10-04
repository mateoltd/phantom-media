# Phantom Twitch

Live channel and VOD client in the Phantom Media workspace. The server routes,
resolver, player, and download flow come from the standalone Phantom Twitch
project. UI uses `@phantom/theme/media.css`, `@phantom/theme/player.css`,
and components from `@phantom/ui`. The transport, scrub bar, settings panel,
switch, search field, sticky header, and artwork tiles are shared with Stream.
Search supports channel avatars and live state, plus VOD metadata previews.
Older history entries are enriched through the lightweight metadata route.

From the workspace root:

```sh
pnpm install
pnpm --filter @phantom/twitch dev
```

The app runs on the default Next.js development port. See the root README for
workspace checks and design package boundaries.

For a Cloudflare Worker deployment, build with the canonical URL and provide
the custom domain to Wrangler:

```sh
NEXT_PUBLIC_BASE_URL=https://your-host.example pnpm --filter @phantom/twitch exec opennextjs-cloudflare build
pnpm --filter @phantom/twitch exec wrangler deploy --domain your-host.example --domain www.your-host.example --var NEXT_PUBLIC_BASE_URL:https://your-host.example
```

The `www` host permanently redirects to the apex while preserving paths and
query strings. Production hostnames are supplied at deploy time and are kept out
of this repository.

The custom `worker.js` entry point streams `/api/proxy` media requests directly
through the Fetch API. All other requests use the generated OpenNext handler.
This keeps multi-megabyte video segments out of Next's Node response adapter;
the Next dev route shares the same proxy implementation. Server-rendered pages
and playlist resolution can exceed Workers Free's 10 ms CPU budget, so a free
account can still return Cloudflare error 1102 even with this media fast path.

Cloudflare Builds deploys this Worker from `main` with `/apps/twitch` as its root.
The build installs the workspace dependencies and runs OpenNext; Wrangler then
deploys to both custom domains. Build caching is enabled and preview builds are
disabled. The Worker watches this app, shared packages, and workspace dependency
files, so changes confined to other apps do not rebuild it.

Playback opens with chat visible. Hide or show chat in the player controls or
the channel controls. On narrow screens, chat appears
below the video details. VODs offer synchronized replay and the channel's live
chat as separate sources. Replay follows pauses and seeks, fetches overlapping
timestamp windows on demand, and deduplicates messages by ID. Live chat uses a
read-only Twitch IRC connection with reconnect and keepalive handling; it does
not send chat messages. Chat availability depends on the source video/channel.
