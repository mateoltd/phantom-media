/**
 * Turning whatever a subtitle catalogue hands over into something a browser
 * will actually display.
 *
 * A `<track>` element accepts WebVTT and nothing else, so the SubRip files
 * that most catalogues serve have to be converted, and they arrive with
 * whatever line endings, byte-order marks and styling tags their author left
 * in. None of that is difficult; all of it is fiddly, which is why it is
 * isolated here where it can be tested.
 *
 * Deliberately free of node builtins: the browser bundle imports this too.
 */

/**
 * Catalogues built on older library data use bibliographic codes, which no
 * display-name table knows. Mapping them to the terminological code first is
 * the difference between "German" and "GER".
 */
const BIBLIOGRAPHIC = Object.freeze({
  alb: "sq", arm: "hy", baq: "eu", bur: "my", chi: "zh", cze: "cs",
  dut: "nl", fre: "fr", geo: "ka", ger: "de", gre: "el", ice: "is",
  mac: "mk", mao: "mi", may: "ms", per: "fa", rum: "ro", slo: "sk",
  tib: "bo", wel: "cy",
});

/** What upstream sometimes writes instead of a language code at all. */
const UNKNOWN_LANGUAGE = "und";

/**
 * A single canonical form, so `spa`, `es` and `es-MX` are one language rather
 * than three. Everything that compares or groups tracks goes through this —
 * otherwise a preferred language of `es` never matches a track labelled `spa`,
 * which is how most of them are labelled.
 */
export function normalizeLanguage(code) {
  const raw = String(code ?? "").trim().toLowerCase();
  if (!raw) return UNKNOWN_LANGUAGE;
  const base = raw.split(/[-_]/)[0];
  if (BIBLIOGRAPHIC[base]) return BIBLIOGRAPHIC[base];
  try {
    // Canonicalisation folds the three-letter codes onto their two-letter
    // equivalents wherever one exists, which is most of them.
    return new Intl.Locale(base).language || base;
  } catch {
    return base;
  }
}

/**
 * A readable name for a language code, falling back to the code itself rather
 * than to nothing: a menu row saying "PTB" is unhelpful, but a blank one is
 * worse.
 */
export function languageName(code) {
  const normalized = normalizeLanguage(code);
  if (normalized === UNKNOWN_LANGUAGE) return "Unknown";
  try {
    const display = new Intl.DisplayNames(["en"], {
      type: "language",
      fallback: "none",
    }).of(normalized);
    if (display) return display;
  } catch {
    // Older runtimes, or a code Intl will not parse.
  }
  return String(code ?? "").toUpperCase() || "Unknown";
}

/* -------------------------------------------------------------------------- */
/* SubRip to WebVTT                                                           */
/* -------------------------------------------------------------------------- */

/** `00:01:02,500` in SubRip is `00:01:02.500` in WebVTT, and nothing else differs. */
const TIMESTAMP = /(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g;
/** Advanced SubStation overrides, which WebVTT has no idea what to do with. */
const OVERRIDE_TAGS = /\{[^}]*\}/g;
/**
 * WebVTT understands b, i, u, c, v, lang and ruby. Anything else — and it is
 * almost always `<font color=…>` — renders as literal text, so it goes.
 */
const UNSUPPORTED_TAGS = /<\/?(?!\/?(?:b|i|u|c|v|lang|ruby|rt)[\s>/])[^>]*>/gi;

function tidy(text) {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(OVERRIDE_TAGS, "")
    .replace(UNSUPPORTED_TAGS, "");
}

export function looksLikeWebVtt(text) {
  return /^﻿?WEBVTT/.test(text ?? "");
}

/**
 * Converts a subtitle file to WebVTT, passing through anything that already
 * is one. Cue numbers are kept: WebVTT reads them as cue identifiers, and
 * dropping them would only risk mangling a file that is already correct.
 */
export function toWebVtt(text) {
  const tidied = tidy(String(text ?? ""));
  if (looksLikeWebVtt(tidied)) {
    return tidied.replace(TIMESTAMP, "$1.$2");
  }
  const body = tidied.replace(TIMESTAMP, "$1.$2").trim();
  return `WEBVTT\n\n${body}\n`;
}

/* -------------------------------------------------------------------------- */
/* Track ordering                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Which track to show first.
 *
 * A catalogue can return well over a hundred tracks for one episode, so the
 * order they arrive in is not an order anyone can use. Preferred languages
 * come first, then everything else alphabetically, and within a language the
 * tracks a playback source supplied lead — those are the ones already matched
 * to this exact file, so they are the ones most likely to be in sync.
 */
export function compareTracks(left, right, preferred = []) {
  const rank = (track) => {
    const index = preferred.indexOf(normalizeLanguage(track.lang));
    return index === -1 ? preferred.length : index;
  };
  const byPreference = rank(left) - rank(right);
  if (byPreference !== 0) return byPreference;

  const byName = languageName(left.lang).localeCompare(languageName(right.lang));
  if (byName !== 0) return byName;

  const origin = (track) => (track.origin === "source" ? 0 : 1);
  return origin(left) - origin(right) || (left.rank ?? 0) - (right.rank ?? 0);
}
