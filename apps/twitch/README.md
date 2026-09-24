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

Playback opens with chat hidden. Show chat in the player controls or beside the
video details to open the optional split view. On narrow screens, chat appears
below the video details. VODs offer synchronized replay and the channel's live
chat as separate sources. Replay follows pauses and seeks, fetches overlapping
timestamp windows on demand, and deduplicates messages by ID. Live chat uses a
read-only Twitch IRC connection with reconnect and keepalive handling; it does
not send chat messages. Chat availability depends on the source video/channel.
