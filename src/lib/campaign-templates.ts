import { Calendar, PartyPopper, RefreshCw, Presentation, Rocket, FlaskConical, Quote } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface CampaignTemplateStep {
  day: string;
  subject: string;
  body: string;
}

export type TemplateCategory = "Generate leads" | "Recruit talents" | "Build connections" | "Engage with network";
export type TemplateChannel = "Email" | "LinkedIn";

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile */
  accent: string;
  goal: string; // pre-fills the AI prompt box
  category: TemplateCategory;
  channels: TemplateChannel[];
  steps: CampaignTemplateStep[];
}

export const TEMPLATE_CATEGORIES: ("All" | TemplateCategory)[] = [
  "All", "Generate leads", "Recruit talents", "Build connections", "Engage with network",
];

export const campaignTemplates: CampaignTemplate[] = [
  {
    id: "book-demo",
    name: "Book a Demo",
    description: "3-step cold sequence to land discovery calls with new prospects.",
    icon: Calendar,
    accent: "bg-blue-50 text-blue-600",
    goal: "Book demo meetings with decision-makers at companies that fit our ICP.",
    category: "Generate leads",
    channels: ["Email"],
    steps: [
      { day: "Day 1", subject: "Quick question, {{firstName}}", body: "Hi {{firstName}},\n\nI noticed {{companyName}} is growing fast in {{industry}}. We help teams like yours cut prospecting time by ~60% with AI-assisted outreach.\n\nWorth a quick 15-minute look this week?\n\nBest,\n{{senderName}}" },
      { day: "Day 3", subject: "Re: Quick question", body: "Hi {{firstName}},\n\nFollowing up on my note. I put together a 2-minute overview of how teams in {{industry}} use us to book more meetings — happy to share.\n\nIs Thursday or Friday better for a short call?\n\n{{senderName}}" },
      { day: "Day 7", subject: "Last note from me", body: "Hi {{firstName}},\n\nI'll keep this brief — if booking more qualified meetings isn't a priority right now, no worries at all. If it is, just reply \"demo\" and I'll send a couple of times.\n\nThanks,\n{{senderName}}" },
    ],
  },
  {
    id: "welcome-series",
    name: "Welcome Series",
    description: "Onboard new sign-ups and drive first value in the first week.",
    icon: PartyPopper,
    accent: "bg-emerald-50 text-emerald-600",
    goal: "Welcome new sign-ups and guide them to their first win.",
    category: "Engage with network",
    channels: ["Email"],
    steps: [
      { day: "Day 1", subject: "Welcome to {{companyName}} 🎉", body: "Hi {{firstName}},\n\nWelcome aboard! Here's the single fastest way to get value in your first session: [link].\n\nReply to this email any time — a real person reads it.\n\n{{senderName}}" },
      { day: "Day 3", subject: "Your 3 most-loved features", body: "Hi {{firstName}},\n\nMost teams get the biggest lift from these three things in week one: [feature 1], [feature 2], [feature 3].\n\nWant a 10-minute walkthrough? Just reply.\n\n{{senderName}}" },
      { day: "Day 7", subject: "How's it going so far?", body: "Hi {{firstName}},\n\nYou're a week in — how's the experience? If anything's unclear, I'd love to help you get unstuck.\n\nWhat's the one thing you wish were easier?\n\n{{senderName}}" },
    ],
  },
  {
    id: "re-engagement",
    name: "Re-engagement",
    description: "Win back leads who went quiet or never replied.",
    icon: RefreshCw,
    accent: "bg-amber-50 text-amber-600",
    goal: "Re-engage cold leads who stopped responding and revive the conversation.",
    category: "Engage with network",
    channels: ["Email"],
    steps: [
      { day: "Day 1", subject: "Still on your radar, {{firstName}}?", body: "Hi {{firstName}},\n\nIt's been a while since we last connected. A lot has changed on our side — including things that directly help {{industry}} teams.\n\nShould I send a quick update, or is now not the time?\n\n{{senderName}}" },
      { day: "Day 4", subject: "A 30-second update", body: "Hi {{firstName}},\n\nQuick recap of what's new and why it matters for {{companyName}}: [highlight].\n\nHappy to walk you through it whenever works.\n\n{{senderName}}" },
      { day: "Day 9", subject: "Should I close your file?", body: "Hi {{firstName}},\n\nI don't want to crowd your inbox. If the timing isn't right, just reply \"later\" and I'll check back next quarter. If you're curious, reply \"yes\" and I'll send details.\n\n{{senderName}}" },
    ],
  },
  {
    id: "webinar-followup",
    name: "Webinar Follow-up",
    description: "Nurture attendees and no-shows into booked meetings.",
    icon: Presentation,
    accent: "bg-purple-50 text-purple-600",
    goal: "Follow up with webinar attendees and no-shows to convert interest into meetings.",
    category: "Build connections",
    channels: ["Email"],
    steps: [
      { day: "Day 1", subject: "Thanks for joining, {{firstName}} — here's the recording", body: "Hi {{firstName}},\n\nGreat having you at the session! Here's the recording and the slides: [link].\n\nThe #1 question we got was about [topic] — want me to send the deeper write-up?\n\n{{senderName}}" },
      { day: "Day 3", subject: "The part most people replay", body: "Hi {{firstName}},\n\nThe segment on [topic] got the most replays. If it's relevant to {{companyName}}, I can show how it applies to your setup in ~15 minutes.\n\nOpen to it?\n\n{{senderName}}" },
      { day: "Day 6", subject: "Want a copy of the playbook?", body: "Hi {{firstName}},\n\nWe turned the webinar into a one-page playbook for {{industry}} teams. Reply \"playbook\" and I'll send it over.\n\n{{senderName}}" },
    ],
  },
  {
    id: "product-launch",
    name: "Product Launch",
    description: "Announce a new product or feature to your audience.",
    icon: Rocket,
    accent: "bg-pink-50 text-pink-600",
    goal: "Announce a new product/feature and drive demos or sign-ups.",
    category: "Engage with network",
    channels: ["Email"],
    steps: [
      { day: "Day 1", subject: "New: something we built for {{industry}} teams", body: "Hi {{firstName}},\n\nWe just launched [product] — built specifically to help {{industry}} teams [outcome].\n\nHere's a 90-second look: [link]. I'd love your take.\n\n{{senderName}}" },
      { day: "Day 4", subject: "Early results from {{companyName}}'s peers", body: "Hi {{firstName}},\n\nTeams using [product] are already seeing [metric]. If you'd like early access for {{companyName}}, I can set it up this week.\n\nInterested?\n\n{{senderName}}" },
    ],
  },
  {
    id: "trial-nurture",
    name: "Free Trial Nurture",
    description: "Convert trial users into paying customers before they churn.",
    icon: FlaskConical,
    accent: "bg-cyan-50 text-cyan-600",
    goal: "Convert free-trial users into paid customers.",
    category: "Generate leads",
    channels: ["Email"],
    steps: [
      { day: "Day 1", subject: "Get the most from your trial, {{firstName}}", body: "Hi {{firstName}},\n\nYour trial is live! The teams who get the most value start with [key action]. Want me to set it up with you?\n\n{{senderName}}" },
      { day: "Day 4", subject: "A quick win for {{companyName}}", body: "Hi {{firstName}},\n\nHere's one thing you can do in 5 minutes that usually pays off fast: [tip].\n\nStuck anywhere? Reply and I'll help.\n\n{{senderName}}" },
      { day: "Day 7", subject: "Your trial ends soon — let's not lose your progress", body: "Hi {{firstName}},\n\nYour trial wraps up in a few days. If it's been useful, I can help you pick the right plan so nothing resets. Want options?\n\n{{senderName}}" },
    ],
  },
  {
    id: "social-proof",
    name: "Social Proof / Case Study",
    description: "Use customer results to build trust and book calls.",
    icon: Quote,
    accent: "bg-indigo-50 text-indigo-600",
    goal: "Use a relevant case study and social proof to earn a meeting.",
    category: "Build connections",
    channels: ["Email"],
    steps: [
      { day: "Day 1", subject: "How a {{industry}} team hit [result]", body: "Hi {{firstName}},\n\nThought this might be relevant — a {{industry}} company much like {{companyName}} used us to reach [result] in [timeframe]. Here's the short story: [link].\n\nCould a similar result help your team?\n\n{{senderName}}" },
      { day: "Day 4", subject: "The exact playbook they used", body: "Hi {{firstName}},\n\nHappy to share the exact steps that team followed — it maps closely to where {{companyName}} is today.\n\nWant the breakdown on a quick call?\n\n{{senderName}}" },
      { day: "Day 8", subject: "Worth 15 minutes?", body: "Hi {{firstName}},\n\nIf hitting [result] is on your roadmap, a quick 15-minute call is the fastest way to see if we're a fit. Grab a time: [link].\n\n{{senderName}}" },
    ],
  },
];

export function getCampaignTemplate(id: string | null | undefined): CampaignTemplate | undefined {
  if (!id) return undefined;
  return campaignTemplates.find((t) => t.id === id);
}
