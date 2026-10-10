---
"@phantom/still": patch
---

Return live playback to the live edge on resume, including native HLS and resumes before metadata arrives. Use Automatic quality and a buffer-aware latency controller to recover drift, adapt safety headroom after stalls, preserve archive rewind, and show when playback is behind live.
