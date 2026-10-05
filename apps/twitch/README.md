# Phantom Twitch

**[Watch on notwitch.tv](https://notwitch.tv)** — a free, open-source, ad-free
Twitch player for live streams and VODs. Search a channel or paste a Twitch
video link; no account, extension, or installation is required.

## Features

- Ad-free live streams and VOD playback.
- Subscriber-only Twitch VODs when their source playlists are available, without a Twitch login.
- Live rewind and seeking through the current broadcast’s archive while the channel is still live, when an archive is available.
- Quality selection, playback speed, keyboard shortcuts, picture-in-picture, and VOD downloads.
- Live chat and synchronized VOD chat replay.
- Browser-local history, resume positions, and playback preferences.
- No app analytics, tracking cookies, or Twitch account requirement.

Source media must still be available: Phantom Twitch cannot restore deleted
videos, and archive-based rewind depends on the channel and Twitch. Media and
chat use third-party services. Cloudflare observability is currently enabled
in the Worker configuration, and opt-in debug diagnostics exist, so account-free
viewing does not mean zero infrastructure logging or network anonymity.

## Development

UI uses `@phantom/theme/media.css`, `@phantom/theme/player.css`, and
`@phantom/ui`; the Twitch resolver, transport, and playback engine live here.

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
