interface UsageBarProps {
  label: string;
  percent: number;
  resetAt: string | null;
}

const TOTAL_SEGS = 30;

function segColor(i: number, filled: number): string {
  if (i >= filled) return "rgba(255,255,255,0.07)";
  const ratio = i / TOTAL_SEGS;
  if (ratio <= 0.5) return "hsl(145,62%,50%)";
  if (ratio <= 0.72) {
    const t = (ratio - 0.5) / 0.22;
    return `hsl(${Math.round(145 - t * 108)},${Math.round(62 + t * 22)}%,${Math.round(50 + t * 5)}%)`;
  }
  if (ratio <= 0.88) {
    const t = (ratio - 0.72) / 0.16;
    return `hsl(${Math.round(37 - t * 37)},92%,57%)`;
  }
  return "hsl(0,82%,62%)";
}

function valueColor(p: number): string {
  if (p >= 90) return "hsl(0,82%,62%)";
  if (p >= 70) return "hsl(37,92%,57%)";
  return "hsl(145,62%,50%)";
}

export function UsageBar({ label, percent, resetAt }: UsageBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * TOTAL_SEGS);

  return (
    <div className="bar">
      <div className="bar__row">
        <span className="bar__label">{label}</span>
        <span className="bar__value" style={{ color: valueColor(percent) }}>
          {Math.round(percent)}%
        </span>
      </div>
      <div
        className="bar__segs"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {Array.from({ length: TOTAL_SEGS }, (_, i) => (
          <div
            key={i}
            className="bar__seg"
            style={{
              background: segColor(i, filled),
              height: i < filled
                ? "100%"
                : i === filled
                ? "72%"
                : "40%",
            }}
          />
        ))}
      </div>
      {resetAt !== null && <span className="bar__meta">resets {resetAt}</span>}
    </div>
  );
}
