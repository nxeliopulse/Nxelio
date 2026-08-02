import { Badge } from "@/components/ui/badge";

export type StatusTone = "open" | "closed" | "success" | "warning" | "danger" | "info" | "neutral";

const TONE_VARIANT: Record<StatusTone, "default" | "success" | "warning" | "danger" | "info" | "blue" | "purple"> = {
  open: "success",
  closed: "default",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  neutral: "default",
};

// Generic status/stage pill — pass a semantic tone, not a hardcoded color, so
// every record type maps its own status vocabulary onto the same 7 tones
// instead of each view redefining its own color-mapping function.
export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return <Badge variant={TONE_VARIANT[tone]}>{label}</Badge>;
}
