"use client";

export interface ProgressRailProps {
  percent: number;
  label: string;
  indeterminate?: boolean;
  done?: boolean;
  idle?: boolean;
  slim?: boolean;
  className?: string;
}

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
