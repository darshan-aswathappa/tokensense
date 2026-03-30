import type React from "react";
import { memo } from "react";

interface UsageBarProps {
  label: string;
  percent: number;
  resetAt: string | null;
  index?: number;
}

function barColor(p: number): string {
  if (p >= 90) return "hsl(0,82%,62%)";
  if (p >= 70) return "#ff8c00";
  return "hsl(145,62%,50%)";
}

export const UsageBar = memo(function UsageBar({ label, percent, resetAt, index = 0 }: UsageBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = barColor(clamped);
  const rounded = Math.round(clamped);

  return (
    <div className="bar">
      <div className="bar__row">
        <span className="bar__label">{label}</span>
        <span className="bar__value" style={{ color }}>
          {rounded}%
        </span>
      </div>
      <div
        className="bar__track"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="bar__fill"
          style={{ width: `${clamped}%`, background: color, '--i': index } as React.CSSProperties}
        />
      </div>
      {resetAt !== null && <span className="bar__meta">resets {resetAt}</span>}
    </div>
  );
});
