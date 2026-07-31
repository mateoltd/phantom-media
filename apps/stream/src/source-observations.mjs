import {
  UNVERIFIED_AUDIO_LANGUAGE,
  normalizeAudioLanguage,
} from "./media-language.mjs";

const CONFIDENCE_WEIGHT = Object.freeze({
  unknown: 0,
  low: 1 / 3,
  medium: 2 / 3,
  high: 1,
});

const UNKNOWN_AUDIO_CLASS = 1;
const UNKNOWN_SUBTITLE_CLASS = 1.5;
const MAX_FALLBACK_CLASS = 15;

function languageObservation(status, languages, confidence) {
  return Object.freeze({
    status,
    languages: Object.freeze([...languages]),
    confidence,
  });
}

function note(entry) {
  return Object.freeze({
    ...entry,
    languages: Object.freeze([...entry.languages]),
  });
}

function videoObservation({
  adaptive = null,
  maxResolution = null,
  typicalResolution = null,
  confidence,
}) {
  return Object.freeze({
    adaptive,
    maxResolution,
    typicalResolution,
    confidence,
  });
}

function performanceObservation(status, bufferingRisk, confidence) {
  return Object.freeze({ status, bufferingRisk, confidence });
}

function playbackHints({
  audio,
  burnedInSubtitles,
  video,
  performance,
  notes,
}) {
  return Object.freeze({
    audio,
    burnedInSubtitles,
    video,
    performance,
    notes: Object.freeze(notes.map(note)),
  });
}

/**
 * Human observations belong to the stable internal source id, never to a
 * transient media URL. They are hints for unknown manifests, not verification.
 */
export const SOURCE_PLAYBACK_OBSERVATIONS = Object.freeze({
  va: playbackHints({
    audio: languageObservation("observed", ["en"], "high"),
    burnedInSubtitles: languageObservation("none", [], "high"),
    video: videoObservation({
      maxResolution: 720,
      confidence: "medium",
    }),
    performance: performanceObservation("unknown", "unknown", "unknown"),
    notes: [
      {
        kind: "audio",
        languages: ["en"],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "English audio observed; not manifest-verified.",
      },
      {
        kind: "burned-in-subtitles",
        languages: [],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "No burned-in subtitles observed.",
      },
      {
        kind: "video",
        languages: [],
        confidence: "medium",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "Observed at up to 720p.",
      },
    ],
  }),
  z2: playbackHints({
    audio: languageObservation("observed", ["en"], "high"),
    burnedInSubtitles: languageObservation("present", ["vi"], "high"),
    video: videoObservation({
      adaptive: true,
      maxResolution: 1080,
      confidence: "high",
    }),
    performance: performanceObservation("unknown", "unknown", "unknown"),
    notes: [
      {
        kind: "audio",
        languages: ["en"],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "English audio observed in playback; not manifest-verified.",
      },
      {
        kind: "burned-in-subtitles",
        languages: ["vi"],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-screenshot",
        text: "Vietnamese burned-in subtitles observed in playback.",
      },
      {
        kind: "video",
        languages: [],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "Adaptive HLS observed with a 1080p rendition.",
      },
    ],
  }),
  s7: playbackHints({
    audio: languageObservation("observed", ["en"], "high"),
    burnedInSubtitles: languageObservation("none", [], "high"),
    video: videoObservation({
      maxResolution: 1080,
      typicalResolution: 480,
      confidence: "high",
    }),
    performance: performanceObservation("slow", "high", "high"),
    notes: [
      {
        kind: "audio",
        languages: ["en"],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "English audio observed; not manifest-verified.",
      },
      {
        kind: "burned-in-subtitles",
        languages: [],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "No burned-in subtitles observed.",
      },
      {
        kind: "video",
        languages: [],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "Supports 1080p but usually sustains about 480p.",
      },
      {
        kind: "performance",
        languages: [],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "Observed too slow for uninterrupted high-resolution playback.",
      },
    ],
  }),
  n1: playbackHints({
    audio: languageObservation("observed", ["en"], "high"),
    burnedInSubtitles: languageObservation("none", [], "high"),
    video: videoObservation({
      maxResolution: 720,
      confidence: "medium",
    }),
    performance: performanceObservation("fast", "low", "high"),
    notes: [
      {
        kind: "audio",
        languages: ["en"],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "English audio observed; not manifest-verified.",
      },
      {
        kind: "burned-in-subtitles",
        languages: [],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "No burned-in subtitles observed.",
      },
      {
        kind: "video",
        languages: [],
        confidence: "medium",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "Assumed to top out at 720p until observed otherwise.",
      },
      {
        kind: "performance",
        languages: [],
        confidence: "high",
        observedAt: "2026-07-26",
        evidence: "user-report",
        text: "Fast playback observed.",
      },
    ],
  }),
});

export function sourcePlaybackHints(sourceId) {
  return SOURCE_PLAYBACK_OBSERVATIONS[sourceId] ?? null;
}

function confidenceOf(observation) {
  return CONFIDENCE_WEIGHT[observation?.confidence] ?? 0;
}

function interpolateFromUnknown(target, unknown, confidence) {
  return unknown + (target - unknown) * confidence;
}

function normalizedLanguages(observation) {
  return new Set(
    (observation?.languages ?? [])
      .map(normalizeAudioLanguage)
      .filter((language) => language !== UNVERIFIED_AUDIO_LANGUAGE),
  );
}

/**
 * Rank an unknown-manifest fallback without claiming its language is verified.
 *
 * Matching audio dominates the subtitle preference. Within matching audio:
 * no burned-in subtitles > matching burned-in subtitles > other subtitles.
 * Confidence pulls observations away from the neutral unknown baseline.
 */
export function fallbackPreferenceForHints(hints, preferredAudioLanguage) {
  const preferred = normalizeAudioLanguage(preferredAudioLanguage);
  if (preferred === UNVERIFIED_AUDIO_LANGUAGE) return 0.5;

  const audio = hints?.audio;
  const audioLanguages = normalizedLanguages(audio);
  const audioTarget = audioLanguages.has(preferred) ? 3 : 0;
  const audioClass =
    audio?.status === "observed" && audioLanguages.size > 0
      ? interpolateFromUnknown(
          audioTarget,
          UNKNOWN_AUDIO_CLASS,
          confidenceOf(audio),
        )
      : UNKNOWN_AUDIO_CLASS;

  const subtitles = hints?.burnedInSubtitles;
  const subtitleLanguages = normalizedLanguages(subtitles);
  let subtitleTarget = UNKNOWN_SUBTITLE_CLASS;
  if (subtitles?.status === "none") {
    subtitleTarget = 3;
  } else if (subtitles?.status === "present") {
    subtitleTarget = subtitleLanguages.has(preferred) ? 2 : 1;
  }
  const subtitleClass =
    subtitles?.status === "none" || subtitles?.status === "present"
      ? interpolateFromUnknown(
          subtitleTarget,
          UNKNOWN_SUBTITLE_CLASS,
          confidenceOf(subtitles),
        )
      : UNKNOWN_SUBTITLE_CLASS;

  return Math.max(
    0,
    Math.min(1, (audioClass * 4 + subtitleClass) / MAX_FALLBACK_CLASS),
  );
}

export function unverifiedFallbackPreference(
  candidate,
  preferredAudioLanguage,
) {
  return fallbackPreferenceForHints(
    candidate?.playbackHints,
    preferredAudioLanguage,
  );
}

export function fallbackPlaybackPreferenceForHints(hints) {
  const performance = hints?.performance;
  const performanceTarget =
    performance?.status === "fast"
      ? 1
      : performance?.status === "slow"
        ? 0
        : 0.5;
  const performanceScore = interpolateFromUnknown(
    performanceTarget,
    0.5,
    confidenceOf(performance),
  );

  const video = hints?.video;
  const observedResolution =
    video?.typicalResolution ?? video?.maxResolution ?? null;
  const resolutionTarget =
    observedResolution === null
      ? 0.5
      : observedResolution >= 1080
        ? 1
        : observedResolution >= 720
          ? 0.7
          : observedResolution >= 480
            ? 0.4
            : 0.2;
  const resolutionScore = interpolateFromUnknown(
    resolutionTarget,
    0.5,
    confidenceOf(video),
  );

  return performanceScore * 0.7 + resolutionScore * 0.3;
}

export function unverifiedFallbackPlaybackPreference(candidate) {
  return fallbackPlaybackPreferenceForHints(candidate?.playbackHints);
}
