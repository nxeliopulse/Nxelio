// Pure, framework-free logic for the Email & Engagement Analytics page.
// Same convention as overview-metrics.ts / prospects-metrics.ts.

export type ReplyClassification = "Positive" | "Neutral" | "Negative" | "Meeting Request" | "Not Interested" | "Unsubscribe" | "Out of Office";

/**
 * Rule-based (NOT a real AI model) reply classifier — this schema has no
 * `reply_classification` table or stored AI confidence/correction fields,
 * so a genuine AI-classification pipeline (the doc's actual ask) is a
 * separate, larger feature. This keyword heuristic gives a real, honest
 * signal today rather than fabricated data, and can be swapped for a real
 * AI call later without changing anything that reads its output shape.
 */
export function classifyReplyHeuristic(bodyText: string): ReplyClassification {
  const text = bodyText.toLowerCase();
  if (/unsubscribe|remove me|stop emailing/.test(text)) return "Unsubscribe";
  if (/out of (the )?office|on vacation|annual leave|auto[- ]?reply/.test(text)) return "Out of Office";
  if (/not interested|no thanks|please stop|not a fit|remove.*list/.test(text)) return "Not Interested";
  if (/schedule a (call|meeting|demo)|book a time|available (on|at)|let'?s (meet|talk|connect)|calendly/.test(text)) return "Meeting Request";
  if (/interested|sounds good|tell me more|would love to|yes please|great, let'?s/.test(text)) return "Positive";
  if (/not the right time|budget|no longer|competitor|already have/.test(text)) return "Negative";
  return "Neutral";
}

const HOUR_BLOCK_LABELS = ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Which 4-hour block + weekday a timestamp falls into, for the Best Time /
 *  Day heatmap (doc §8). Uses the Date object's local time — this app has
 *  no per-workspace timezone setting (see the Overview page's same note),
 *  so "workspace time zone" here is the server's local time. */
export function dayHourBucket(date: Date): { day: string; hourBlock: string } {
  const hour = date.getHours();
  const blockIndex = Math.floor(hour / 4);
  return { day: DAY_LABELS[date.getDay()], hourBlock: HOUR_BLOCK_LABELS[blockIndex] };
}

export { HOUR_BLOCK_LABELS, DAY_LABELS };
