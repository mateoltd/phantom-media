/** One owner for live positioning and playback rate; archive/VOD players never attach it. */
export interface LiveTimeline {
  live: boolean;
  targetDuration: number;
  segmentDuration: number;
  partTarget: number;
  partHoldBack: number;
  age: number;
  edge: number;
  prefetch?: boolean;
  prefetchDuration?: number;
}

interface LiveOptions {
  timeline: () => LiveTimeline | null;
  native?: boolean;
  setTargetLatency?: (seconds: number) => void;
  refreshTimeline?: () => void;
  onSeek?: (position: number) => void;
  now?: () => number;
}

export function bufferAhead(ranges: TimeRanges, position: number): number {
  for (let index = 0; index < ranges.length; index++) {
    if (ranges.start(index) <= position && position < ranges.end(index)) {
      return ranges.end(index) - position;
    }
  }
  return 0;
}

export function minimumLiveLatency(timeline: LiveTimeline | null): number {
  // Parts can safely get closer than a full segment. Honour the LL-HLS server's
  // part hold-back; regular HLS needs one segment plus a delivery margin.
  if (timeline && timeline.partTarget > 0) {
    return Math.max(1, timeline.partHoldBack, timeline.partTarget * 3);
  }
  return Math.max(2, (timeline?.segmentDuration || timeline?.targetDuration || 2) * 1.5);
}

export function createLiveLatencyController(video: HTMLVideoElement, options: LiveOptions) {
  const now = options.now ?? (() => performance.now());
  let margin = 0;
  let target = 0;
  let pendingLive = false;
  let awaitingTimeline = false;
  let graceUntil = 0;
  let lastStall = -Infinity;
  let healthySince: number | null = null;
  let previousTime = video.currentTime;
  let catchingUp = false;
  let starvedSince: number | null = null;
  let waitingSince: number | null = null;
  let burstReserve = 0.75;
  let probeSince: number | null = null;
  let destroyed = false;

  const setRate = (rate: number) => {
    if (video.playbackRate !== rate) video.playbackRate = rate;
  };
  const reset = () => {
    burstReserve = 0.75;
    probeSince = null;
    healthySince = null;
    starvedSince = null;
    waitingSince = null;
    catchingUp = false;
    graceUntil = now() + 3_000;
    previousTime = video.currentTime;
    setRate(1);
  };
  const position = (): number | null => {
    const timeline = options.timeline();
    if (!timeline && !options.native) return null;
    if (timeline && (!timeline.live || timeline.age > Math.max(6, timeline.targetDuration * 3))) return null;
    const nextTarget = minimumLiveLatency(timeline) + margin;
    if (nextTarget !== target) {
      target = nextTarget;
      options.setTargetLatency?.(target);
    }
    const ranges = video.seekable;
    if (!ranges.length) return null;
    // The newest range is the live window, including after a discontinuity.
    const index = ranges.length - 1;
    const start = ranges.start(index);
    const end = ranges.end(index);
    // TARGETDURATION is an upper bound, often 6s for Twitch's actual 2s
    // segments. hls.liveSyncPosition clamps to that upper bound, so compute
    // our position from the measured cadence, retaining one available unit.
    const unit = timeline?.partTarget || timeline?.segmentDuration || 2;
    const availableEnd = timeline?.prefetch
      ? timeline.edge - (timeline.prefetchDuration ?? unit * 2) - (burstReserve + margin)
      : timeline ? timeline.edge - unit : end;
    let sync = timeline
      ? Math.min(timeline.edge + timeline.age - target, availableEnd)
      : end - target;
    if (timeline?.prefetch && video.buffered.length) {
      const bufferedIndex = video.buffered.length - 1;
      const bufferedEnd = Math.min(end, video.buffered.end(bufferedIndex));
      const bufferedStart = Math.max(start, video.buffered.start(bufferedIndex));
      const reserve = burstReserve + margin;
      if (bufferedEnd - bufferedStart >= reserve) {
        // Encoded prefetch bytes can lead the completed playlist edge. Resume
        // into those real bytes with the same reserve as steady playback.
        sync = Math.max(sync, bufferedEnd - reserve);
      }
    }
    if (!Number.isFinite(sync) || end <= start) return null;
    return Math.max(start, Math.min(sync, end - 0.1));
  };
  const seek = (destination: number) => {
    reset();
    if (Math.abs(video.currentTime - destination) > 0.35) {
      video.currentTime = destination;
      options.onSeek?.(destination);
    }
  };
  const goLive = () => {
    if (destroyed) return;
    reset();
    pendingLive = true;
    const destination = position();
    const timeline = options.timeline();
    const unit = timeline?.partTarget || timeline?.segmentDuration || 2;
    const reserve = timeline?.prefetch ? burstReserve + margin : 1.5;
    if (options.refreshTimeline && timeline &&
        (timeline.age > unit || destination !== null && bufferAhead(video.buffered, destination) < reserve - 0.05)) {
      // Paused playback can be on a slower reload cadence. Refresh once on
      // resume, then land in the newly available window instead of exhausting
      // the tail of the previous playlist while its reload timer is pending.
      if (destination !== null) seek(destination);
      awaitingTimeline = true;
      options.refreshTimeline();
      return;
    }
    awaitingTimeline = false;
    if (destination === null) return;
    seek(destination);
    pendingLive = false;
  };
  const refresh = () => {
    if (destroyed) return;
    awaitingTimeline = false;
    const destination = position();
    if (pendingLive && destination !== null) {
      seek(destination);
      pendingLive = false;
    }
  };
  const stall = () => {
    const time = now();
    if (destroyed || video.paused || video.seeking || video.ended || !video.played.length || time < graceUntil) return;
    burstReserve = 0.75;
    probeSince = null;
    healthySince = null;
    catchingUp = false;
    setRate(1);
    // Multiple notifications from the same stall count once.
    if (time - lastStall < 5_000) return;
    lastStall = time;
    margin = Math.min(margin + 1, Math.max(4, (options.timeline()?.segmentDuration || 2) * 2));
    position();
  };
  const tick = (active: boolean, unstable: boolean) => {
    if (destroyed) return;
    const destination = position();
    const time = now();
    const progressing = video.currentTime > previousTime;
    previousTime = video.currentTime;
    if (pendingLive && !awaitingTimeline && destination !== null) {
      seek(destination);
      pendingLive = false;
      return;
    }
    if (!active || video.paused || video.seeking || video.ended || destination === null || time < graceUntil) {
      burstReserve = 0.75;
      probeSince = null;
      healthySince = null;
      starvedSince = null;
      catchingUp = false;
      setRate(1);
      return;
    }
    const ahead = bufferAhead(video.buffered, video.currentTime);
    const predictive = options.timeline()?.prefetch === true;
    if (video.readyState < 3 && !progressing) {
      starvedSince ??= time;
      if (time - starvedSince >= 2_000) stall();
    } else {
      starvedSince = null;
    }
    if (unstable || video.readyState < 3 || !progressing) {
      burstReserve = 0.75;
      probeSince = null;
      healthySince = null;
      catchingUp = false;
      setRate(1);
      return;
    }
    // Probe a slightly smaller reserve only after sustained real delivery.
    // Actual starvation, inactivity, seeks and resumes restore the safe base.
    if (predictive && margin === 0 && ahead >= 0.6) {
      probeSince ??= time;
      if (time - probeSince >= 30_000) burstReserve = 0.6;
    } else {
      probeSince = null;
    }
    const reserve = predictive ? burstReserve + margin : 1.5;
    if (ahead < reserve) {
      healthySince = null;
      catchingUp = false;
      // Build real headroom after delivery jitter without a backward seek.
      // Browsers preserve audio pitch at this small adjustment.
      setRate(predictive ? 0.97 : 1);
      return;
    }
    healthySince ??= time;
    if (margin > 0 && time - healthySince >= 30_000) {
      margin = Math.max(0, margin - 0.5);
      healthySince = time;
      position();
    }
    const drift = destination - video.currentTime;
    // A large delay should not take minutes of accelerated playback to fix.
    // Only skip when the landing point already has enough contiguous media.
    if (drift > Math.max(8, (options.timeline()?.segmentDuration || 2) * 2) &&
        bufferAhead(video.buffered, destination) >= reserve - 0.05) {
      seek(destination);
      return;
    }
    // Hysteresis avoids audible rate oscillation around the target. Protect
    // the contiguous buffer reserve and never accelerate an unhealthy stream.
    // Predictive playlists include media that has not been encoded yet. Their
    // advertised edge is not an available buffer: ride the actual contiguous
    // bytes with a 600–750ms burst reserve, adapting upward after rebuffering.
    // Completed-segment timestamps are a safe resume point, but progressive
    // bytes can already be playable beyond it. Let actual buffered media
    // drive steady catch-up rather than waiting for the next playlist reload.
    const excess = predictive ? ahead - reserve : drift;
    const threshold = catchingUp ? (predictive ? 0.1 : 0.25) : (predictive ? 0.25 : 1);
    catchingUp = excess > threshold;
    const canAccelerate = catchingUp && ahead >= (predictive ? reserve + 0.2 : 2);
    setRate(canAccelerate ? (predictive ? 1.03 : 1.05) : 1);
  };
  const onPlay = () => goLive();
  const onPause = () => {
    pendingLive = false;
    awaitingTimeline = false;
    reset();
  };
  const onWaiting = () => { if (waitingSince === null) waitingSince = now(); };
  const onPlaying = () => {
    if (waitingSince !== null && now() - waitingSince >= 250) stall();
    waitingSince = null;
  };
  video.addEventListener("play", onPlay);
  video.addEventListener("pause", onPause);
  video.addEventListener("seeking", reset);
  video.addEventListener("waiting", onWaiting);
  video.addEventListener("playing", onPlaying);
  return {
    goLive, refresh, tick, stall, reset,
    get targetLatency() { return target; },
    get behindLive() {
      const destination = position();
      return destination !== null && destination - video.currentTime > 3;
    },
    destroy() {
      destroyed = true;
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeking", reset);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      setRate(1);
    },
  };
}
