// Extracted verbatim (styling ported to dark-mode-aware Tailwind) from the
// old analytics-view.tsx's `Heatmap` — a 7×24 activity-volume grid.
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR = Array.from({ length: 24 }, (_, i) => (i === 0 ? "12a" : i < 12 ? `${i}a` : i === 12 ? "12p" : `${i - 12}p`));

export function HeatmapSystem({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat(), 1);
  return (
    <div className="select-none p-4">
      <div className="flex pl-8 mb-1">
        {HOUR.map((h, i) => (
          <div key={i} className="flex-1 text-center text-[11px] text-slate-400">
            {i % 4 === 0 ? h : ""}
          </div>
        ))}
      </div>
      {grid.map((row, d) => (
        <div key={d} className="flex items-center mb-0.5">
          <span className="w-7 text-right pr-1 text-[11px] text-slate-400">{DOW[d]}</span>
          {row.map((v, h) => {
            const t = v / max;
            return (
              <div
                key={h}
                title={`${v} · ${DOW[d]} ${HOUR[h]}`}
                className="flex-1 h-5 transition-all hover:scale-105 rounded-sm mx-px"
                style={{ background: v === 0 ? "var(--muted)" : `rgba(1, 118, 211, ${0.1 + t * 0.9})` }}
              />
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-1.5 justify-end mt-2">
        <span className="text-[11px] text-slate-400">Less</span>
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
          <div key={i} className="w-4 h-3 rounded-sm" style={{ background: v === 0 ? "var(--muted)" : `rgba(1, 118, 211, ${0.1 + v * 0.9})` }} />
        ))}
        <span className="text-[11px] text-slate-400">More</span>
      </div>
    </div>
  );
}
