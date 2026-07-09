export type PlaybookChannel = "LinkedIn" | "Email" | "Multi-channel" | "Follow-up" | "Cold outreach";

export interface PlaybookTemplate {
  key: string;
  title: string;
  description: string;
  channel: PlaybookChannel;
  steps: number;
  days: number;
  replyRate: string;
  tags: string[];
  recommendedFor: string[]; // goals that surface the Recommended badge
}

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    key: "linkedin-cold-outreach",
    title: "LinkedIn Cold Outreach",
    description: "Connect with decision makers on LinkedIn with a proven multi-touch sequence.",
    channel: "LinkedIn",
    steps: 5,
    days: 14,
    replyRate: "28%",
    tags: ["LinkedIn", "Cold outreach"],
    recommendedFor: ["Generate leads", "Build pipeline", "Enterprise sales"],
  },
  {
    key: "cold-email-sequence",
    title: "Cold Email Sequence",
    description: "Short, punchy cold emails with follow-ups timed for maximum deliverability.",
    channel: "Email",
    steps: 4,
    days: 10,
    replyRate: "18%",
    tags: ["Email", "Cold outreach"],
    recommendedFor: ["Generate leads", "Build pipeline", "Scale outreach"],
  },
  {
    key: "warm-lead-nurture",
    title: "Warm Lead Nurture",
    description: "Re-engage warm leads who opened but didn't reply with educational content.",
    channel: "Email",
    steps: 3,
    days: 7,
    replyRate: "34%",
    tags: ["Email", "Follow-up"],
    recommendedFor: ["Improve conversions", "Nurture pipeline", "Increase revenue"],
  },
  {
    key: "linkedin-email-combo",
    title: "LinkedIn + Email Combo",
    description: "Touch prospects on both channels for a 2× higher reply rate.",
    channel: "Multi-channel",
    steps: 6,
    days: 18,
    replyRate: "41%",
    tags: ["LinkedIn", "Email", "Multi-channel"],
    recommendedFor: ["Build pipeline", "Enterprise sales", "Generate leads"],
  },
  {
    key: "trial-followup",
    title: "Trial / Demo Follow-Up",
    description: "Follow up with demo attendees or trial users before they go cold.",
    channel: "Follow-up",
    steps: 4,
    days: 8,
    replyRate: "52%",
    tags: ["Email", "Follow-up"],
    recommendedFor: ["Improve conversions", "Increase revenue", "Reduce churn"],
  },
  {
    key: "inbound-lead-response",
    title: "Inbound Lead Response",
    description: "Speed-to-lead playbook — respond to new inbound leads within minutes.",
    channel: "Multi-channel",
    steps: 3,
    days: 5,
    replyRate: "60%",
    tags: ["Email", "LinkedIn", "Multi-channel"],
    recommendedFor: ["Improve conversions", "Scale outreach", "Increase revenue"],
  },
];

export const PLAYBOOK_CHANNELS: Array<PlaybookChannel | "All"> = [
  "All", "LinkedIn", "Email", "Multi-channel", "Follow-up", "Cold outreach",
];
