"use client";

/**
 * Two-handle range slider — floating value labels above each thumb, tick
 * labels below the track (matches the "Recommended limits" style sliders in
 * outreach tools like Expandi/Dripify). Built from two overlapping native
 * `<input type="range">` elements rather than custom pointer handling, so
 * keyboard/touch/accessibility all come for free.
 */
export function DualRangeSlider({
  min,
  max,
  step = 1,
  trackMin,
  trackMax,
  ticks,
  onChange,
}: {
  min: number;
  max: number;
  step?: number;
  trackMin: number;
  trackMax: number;
  ticks: number[];
  onChange: (min: number, max: number) => void;
}) {
  const pct = (v: number) => ((v - trackMin) / (trackMax - trackMin)) * 100;

  function handleMinChange(v: number) {
    onChange(Math.min(v, max), max);
  }
  function handleMaxChange(v: number) {
    onChange(min, Math.max(v, min));
  }

  return (
    <div className="pt-7 pb-1">
      <div className="relative h-6">
        {/* Track */}
        <div className="absolute top-1/2 left-0 right-0 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
        {/* Filled range */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-600"
          style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }}
        />
        {/* Floating value labels */}
        <span
          className="absolute -top-6 -translate-x-1/2 text-sm font-bold text-blue-700 tabular-nums"
          style={{ left: `${pct(min)}%` }}
        >
          {min}
        </span>
        <span
          className="absolute -top-6 -translate-x-1/2 text-sm font-bold text-blue-700 tabular-nums"
          style={{ left: `${pct(max)}%` }}
        >
          {max}
        </span>

        <input
          type="range"
          min={trackMin}
          max={trackMax}
          step={step}
          value={min}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          aria-label="Minimum per day"
          className="lp-range-thumb absolute inset-0 w-full appearance-none bg-transparent"
          style={{ zIndex: min > trackMax - (trackMax - trackMin) / 20 ? 5 : 3 }}
        />
        <input
          type="range"
          min={trackMin}
          max={trackMax}
          step={step}
          value={max}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          aria-label="Maximum per day"
          className="lp-range-thumb absolute inset-0 w-full appearance-none bg-transparent"
          style={{ zIndex: 4 }}
        />
      </div>

      <div className="mt-2 flex justify-between text-xs text-slate-400 tabular-nums">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
