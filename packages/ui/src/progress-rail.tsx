"use client";

export interface ProgressRailProps {
  /** 0–100. Ignored when `indeterminate` is set. */
  percent: number;
  label: string;
  /** Work is happening but there is no measurable progress yet. */
  indeterminate?: boolean;
  /** Paint the fill in the success colour once the work has landed. */
  done?: boolean;
  /** Grey the fill out while the job is queued rather than running. */
  idle?: boolean;
  slim?: boolean;
  className?: string;
}

/**
 * One colour, one motion. The rail reads as a level rising, which is why it
 * never gets a second tone or a texture.
 */
export function ProgressRail({
  percent,
  label,
  indeterminate = false,
  done = false,
  idle = false,
  slim = false,
  className = "",
}: ProgressRailProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <span
      className={`job-rail ${slim ? "job-rail-slim" : ""} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-label={label}
    >
      {indeterminate ? (
        <span className="job-rail-indeterminate" />
      ) : (
        <span
          className={`job-fill ${done ? "job-fill-done" : ""} ${
            idle ? "job-fill-idle" : ""
          }`}
          style={{ width: `${clamped}%` }}
        />
      )}
    </span>
  );
}
