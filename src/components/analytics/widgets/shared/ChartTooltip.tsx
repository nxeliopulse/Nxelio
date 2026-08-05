// Extracted from the old analytics-view.tsx's `Tip` component — shared
// recharts tooltip used by every widget below.
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#1A2536",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        minWidth: 120,
        color: "#FFF",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {label && <p className="font-bold text-slate-200 mb-1 border-b border-slate-700 pb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1">
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color ?? "#0176D3", flexShrink: 0 }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-bold text-white ml-auto pl-4">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
