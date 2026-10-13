---
"@phantom/still": patch
---

Fix live buffering and unavailable-media failures caused by Twitch fMP4 prefetch URLs changing on completion and progressive chunks resetting timestamps. Preserve progressive playback and manual quality, use smaller batches and faster buffer checks, and retain a bounded fallback for unsupported predictive sequences.
