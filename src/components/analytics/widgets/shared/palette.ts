// Chart palette + number formatting, extracted from the old analytics-view.tsx
// (PAL/fmtK/fmt) so both dashboard rendering and the builder's live preview
// can share one source instead of duplicating the constants.
export const PAL = [
  "#0176D3", // Brand Blue
  "#52B7D8", // Sky Blue
  "#34BEC2", // Teal
  "#E077AE", // Rose
  "#FF9A52", // Amber/Peach
  "#7C3AED", // Violet
  "#2E7D32", // Success Green
  "#EA580C", // Orange
];

export function fmtK(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function fmt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export function formatValue(n: number, unit?: "number" | "currency" | "percent"): string {
  if (unit === "currency") return fmtK(n);
  if (unit === "percent") return `${n}%`;
  return fmt(n);
}
