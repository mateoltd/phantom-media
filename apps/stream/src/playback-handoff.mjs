// Pure playback-handoff helpers (no DOM deps beyond duck-typed args).
// lib/player.ts re-exports these so the router and unit tests share one impl.

export function capturePlaybackSnapshot(video, controller, subtitleTrack = null) {
  if (!video || !Number.isFinite(video.currentTime)) return null;
  let selectedLevel = -1;
  let selectedAudio = -1;
  try {
    selectedLevel = controller?.quality?.().selected ?? -1;
  } catch {
    selectedLevel = -1;
  }
  try {
    selectedAudio = controller?.audio?.().selected ?? -1;
  } catch {
    selectedAudio = -1;
  }
  return {
    currentTime: Math.max(0, video.currentTime),
    paused: Boolean(video.paused),
    selectedLevel: Number.isInteger(selectedLevel) ? selectedLevel : -1,
    selectedAudio: Number.isInteger(selectedAudio) ? selectedAudio : -1,
    selectedSubtitle:
      Number.isInteger(subtitleTrack) && subtitleTrack >= 0 ? subtitleTrack : null,
  };
}

export function applyPlaybackSnapshot(video, controller, snapshot) {
  if (!snapshot) return null;
  try {
    if (snapshot.selectedLevel >= 0) controller?.setLevel?.(snapshot.selectedLevel);
  } catch {
    // A new manifest may not offer the same rendition; keep playing.
  }
  try {
    if (snapshot.selectedAudio >= 0) controller?.setAudioTrack?.(snapshot.selectedAudio);
  } catch {
    // Same: never fail the handoff on a missing audio rendition.
  }
  try {
    if (video && Number.isFinite(snapshot.currentTime)) {
      video.currentTime = Math.max(0, snapshot.currentTime);
    }
  } catch {
    // Seek failures are surfaced by the element; do not throw.
  }
  return snapshot;
}
