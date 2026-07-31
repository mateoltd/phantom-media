import {
  UNVERIFIED_AUDIO_LANGUAGE,
  normalizeAudioLanguage,
} from "./media-language.mjs";

const VIABLE_STATUSES = new Set([
  "offered",
  "holding",
  "playing",
  "languageMismatch",
  "languageUnknown",
]);

function add(target, value) {
  const language = normalizeAudioLanguage(value);
  if (language) target.add(language);
}

export function collectAvailableAudioLanguages(sourceEvidence, activeTracks = []) {
  const languages = new Set();

  for (const source of sourceEvidence ?? []) {
    if (!VIABLE_STATUSES.has(source?.status)) continue;
    const declared = Array.isArray(source.languages) ? source.languages : [];
    if (declared.length === 0 && source.status === "languageUnknown") {
      languages.add(UNVERIFIED_AUDIO_LANGUAGE);
    }
    for (const language of declared) add(languages, language);
  }

  for (const track of activeTracks ?? []) {
    add(languages, track?.language ?? track?.label);
  }
  return [...languages];
}

export function orderAvailableAudioLanguages(languages, preferred) {
  const normalizedPreferred = normalizeAudioLanguage(preferred);
  return [
    ...new Set((languages ?? []).map(normalizeAudioLanguage).filter(Boolean)),
  ].sort((left, right) => {
    if (left === normalizedPreferred) return -1;
    if (right === normalizedPreferred) return 1;
    if (left === UNVERIFIED_AUDIO_LANGUAGE) return 1;
    if (right === UNVERIFIED_AUDIO_LANGUAGE) return -1;
    return left.localeCompare(right);
  });
}
