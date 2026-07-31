const RANK = Object.freeze({
  playing: 0,
  holding: 1,
  offered: 1,
  asking: 2,
  queued: 2,
  idle: 3,
  languageUnknown: 4,
  languageMismatch: 4,
  slow: 4,
  empty: 5,
  unplayable: 6,
  unreachable: 6,
  limited: 7,
});

// Zero is a struck-through meter, not an empty one: it means the source never
// answered, where one bar means it answered with nothing to play.
const BARS = Object.freeze({
  playing: 5,
  holding: 4,
  offered: 4,
  languageUnknown: 3,
  languageMismatch: 3,
  slow: 2,
  asking: 2,
  queued: 1,
  idle: 1,
  empty: 1,
  unplayable: 0,
  unreachable: 0,
  limited: 0,
});

export function sourceAvailabilityRank(status) {
  return RANK[status] ?? RANK.idle;
}

export function sourceAvailabilityBars(status) {
  const bars = BARS[status];
  return bars === undefined ? BARS.idle : bars;
}

export function sourceAvailabilityTone(status) {
  switch (status) {
    case "playing":
    case "holding":
    case "offered":
      return "green";
    case "asking":
    case "queued":
    case "limited":
    case "languageUnknown":
    case "languageMismatch":
    case "slow":
      return "orange";
    case "empty":
    case "unplayable":
    case "unreachable":
      return "red";
    default:
      return "grey";
  }
}
