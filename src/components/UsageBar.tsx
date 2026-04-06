import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";

interface UsageBarProps {
  label: string;
  percent: number;
  resetAt: string | null;
  index?: number;
}

function resolvedBarColor(p: number): string {
  if (p >= 90) return "#d45656";
  if (p >= 70) return "#f59e0b";
  return "#18E299";
}

export const UsageBar = memo(function UsageBar({ label, percent, resetAt, index = 0 }: UsageBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  // Tracks spring state across effect runs so updates start from current position
  const spring = useRef({ pos: 0, vel: 0, raf: 0 });
  const firstRender = useRef(true);
  const [displayPct, setDisplayPct] = useState(0);

  // Set initial color synchronously before first paint — prevents 1-frame wrong-color flash
  useLayoutEffect(() => {
    barRef.current?.style.setProperty("--bar-color", resolvedBarColor(clamped));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bar = barRef.current;
    const fill = fillRef.current;
    if (!bar || !fill) return;

    // Update status color — CSS @property transitions this smoothly on threshold crossings
    bar.style.setProperty("--bar-color", resolvedBarColor(clamped));

    // Treat missing matchMedia (e.g. jsdom) as reduced motion so tests stay synchronous
    const reduced =
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      fill.style.width = `${clamped}%`;
      setDisplayPct(Math.round(clamped));
      spring.current = { pos: clamped, vel: 0, raf: 0 };
      firstRender.current = false;
      return;
    }

    cancelAnimationFrame(spring.current.raf);

    const to = clamped;
    let { pos, vel } = spring.current;
    // Stagger entry on first mount; subsequent updates are instant-start
    const delay = firstRender.current ? index * 70 + 100 : 0;
    firstRender.current = false;

    let lastTime = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = (now: number) => {
      if (lastTime === 0) lastTime = now;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Spring: stiffness=180, damping=20 → ζ≈0.745, ~3% overshoot on large steps
      const acc = 180 * (to - pos) - 20 * vel;
      vel += acc * dt;
      pos += vel * dt;

      const w = Math.max(0, pos);
      fill.style.width = `${w}%`;
      setDisplayPct(Math.round(Math.min(100, w)));

      const settled = Math.abs(to - pos) < 0.05 && Math.abs(vel) < 0.05;
      if (!settled) {
        spring.current = { pos, vel, raf: requestAnimationFrame(tick) };
      } else {
        fill.style.width = `${to}%`;
        setDisplayPct(Math.round(to));
        spring.current = { pos: to, vel: 0, raf: 0 };
      }
    };

    if (delay > 0) {
      timeoutId = setTimeout(() => {
        spring.current.raf = requestAnimationFrame(tick);
      }, delay);
    } else {
      spring.current.raf = requestAnimationFrame(tick);
    }

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(spring.current.raf);
      // spring.current.pos holds last animated position — next run starts from here
    };
  }, [clamped, index]);

  return (
    <div className="bar" ref={barRef}>
      <div className="bar__row">
        <span className="bar__label">{label}</span>
        <span className="bar__value">{displayPct}%</span>
      </div>
      <div
        className="bar__track"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="bar__fill" ref={fillRef} />
      </div>
      {resetAt !== null && <span className="bar__meta">resets {resetAt}</span>}
    </div>
  );
});
