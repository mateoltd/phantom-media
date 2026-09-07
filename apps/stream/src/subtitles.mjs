
const BIBLIOGRAPHIC = Object.freeze({
  alb: "sq", arm: "hy", baq: "eu", bur: "my", chi: "zh", cze: "cs",
  dut: "nl", fre: "fr", geo: "ka", ger: "de", gre: "el", ice: "is",
  mac: "mk", mao: "mi", may: "ms", per: "fa", rum: "ro", slo: "sk",
  tib: "bo", wel: "cy",
});

const UNKNOWN_LANGUAGE = "und";

export function normalizeLanguage(code) {
  const raw = String(code ?? "").trim().toLowerCase();
  if (!raw) return UNKNOWN_LANGUAGE;
  const base = raw.split(/[-_]/)[0];
  if (BIBLIOGRAPHIC[base]) return BIBLIOGRAPHIC[base];
  try {
    return new Intl.Locale(base).language || base;
  } catch {
    return base;
  }
}

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
  }
  return String(code ?? "").toUpperCase() || "Unknown";
}

const TIMESTAMP = /(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g;
const OVERRIDE_TAGS = /\{[^}]*\}/g;
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

export function toWebVtt(text) {
  if (/^\s*\[Events\]/mi.test(String(text ?? ""))) return assToWebVtt(String(text));
  const tidied = tidy(String(text ?? ""));
  if (looksLikeWebVtt(tidied)) {
    return tidied.replace(TIMESTAMP, "$1.$2");
  }
  const body = tidied.replace(TIMESTAMP, "$1.$2").trim();
  return `WEBVTT\n\n${body}\n`;
}

function assToWebVtt(text) {
  let events = false;
  let fields = [];
  const cues = [];
  const timestamp = value => {
    const match = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/.exec(value.trim());
    if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return null;
    return `${match[1].padStart(2, "0")}:${match[2]}:${match[3]}.${match[4].padEnd(3, "0")}`;
  };
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^\s*\[/.test(line)) { events = line.trim() === "[Events]"; continue; }
    if (!events) continue;
    if (/^Format:/i.test(line)) {
      fields = line.slice(line.indexOf(":") + 1).split(",").map(field => field.trim().toLowerCase());
    }
    if (!/^Dialogue:/i.test(line) || fields.at(-1) !== "text") continue;
    const values = line.slice(line.indexOf(":") + 1).split(",");
    const start = timestamp(values[fields.indexOf("start")] ?? "");
    const end = timestamp(values[fields.indexOf("end")] ?? "");
    if (!start || !end || end <= start) continue;
    const content = values.slice(fields.length - 1).join(",");
    if (/\{[^}]*\\p[1-9]/.test(content)) continue; // ASS drawing commands are not dialogue.
    const caption = tidy(content).replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ").trim();
    if (caption) cues.push(`${start} --> ${end}\n${caption}`);
  }
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

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
