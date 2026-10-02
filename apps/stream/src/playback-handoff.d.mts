export interface PlaybackSnapshot {
  currentTime: number;
  paused: boolean;
  selectedLevel: number;
  selectedAudio: number;
  selectedSubtitle?: number | null;
}

export declare function capturePlaybackSnapshot(
  video: { currentTime: number; paused: boolean } | null | undefined,
  controller:
    | {
        quality?: () => { selected: number };
        audio?: () => { selected: number };
      }
    | null
    | undefined,
  subtitleTrack?: number | null,
): PlaybackSnapshot | null;

export declare function applyPlaybackSnapshot(
  video: { currentTime: number } | null | undefined,
  controller:
    | {
        setLevel?: (index: number) => void;
        setAudioTrack?: (index: number) => void;
      }
    | null
    | undefined,
  snapshot: PlaybackSnapshot | null | undefined,
): PlaybackSnapshot | null;
