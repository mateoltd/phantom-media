export declare function sourceAvailabilityRank(status?: string): number;
/** Signal-meter height, 1 to 5, or 0 for a source that never answered. */
export declare function sourceAvailabilityBars(
  status?: string,
): 0 | 1 | 2 | 3 | 4 | 5;
export declare function sourceAvailabilityTone(
  status?: string,
): "green" | "orange" | "red" | "grey";
