"use server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/resend";
import { generateConferenceLink } from "@/lib/meetings/conference-link";

const SALES_NOTIFY_EMAIL = "anu.ramachandran@gmail.com";

export interface DemoRequestInput {
  fullName: string;
  businessEmail: string;
  phone: string;
  industry: string;
  employeeCount: string;
  monthlyRevenue: string;
  purpose: string;
  referralSource: string;
  date: string; // "YYYY-MM-DD"
  hour: string; // "1".."12"
  minute: string; // "00".."59"
  meridiem: "AM" | "PM";
}

export interface DemoRequestResult {
  ok: boolean;
  error?: string;
  joinUrl?: string;
  formattedDate?: string;
  formattedTime?: string;
}

function combineDateTime(date: string, hour: string, minute: string, meridiem: "AM" | "PM"): Date | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  let h = parseInt(hour, 10);
  if (Number.isNaN(h) || h < 1 || h > 12) return null;
  const min = parseInt(minute, 10);
  if (Number.isNaN(min) || min < 0 || min > 59) return null;
  if (meridiem === "PM" && h !== 12) h += 12;
  if (meridiem === "AM" && h === 12) h = 0;
  const dt = new Date(y, m - 1, d, h, min, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function submitDemoRequest(input: DemoRequestInput): Promise<DemoRequestResult> {
  const fullName = input.fullName.trim();
  const businessEmail = input.businessEmail.trim().toLowerCase();
  const phone = input.phone.trim();
  const purpose = input.purpose?.trim() || null;

  if (!fullName) return { ok: false, error: "Please enter your name." };
  if (!businessEmail.includes("@")) return { ok: false, error: "Please enter a valid business email." };
  if (!phone) return { ok: false, error: "Please enter your phone number." };
  if (!input.industry) return { ok: false, error: "Please select your industry." };
  if (!input.employeeCount) return { ok: false, error: "Please select your company size." };
  if (!input.monthlyRevenue) return { ok: false, error: "Please select your monthly revenue." };
  if (!input.date) return { ok: false, error: "Please pick an available date." };

  const meetingStartAt = combineDateTime(input.date, input.hour, input.minute, input.meridiem);
  if (!meetingStartAt) return { ok: false, error: "Please pick a valid time." };

  const requestedTime = `${input.hour}:${input.minute} ${input.meridiem}`;
  const formattedDate = meetingStartAt.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  const admin = createAdminClient();
  const joinUrl = generateConferenceLink("google_meet");

  const { error } = await admin.from("demo_requests").insert({
    full_name: fullName,
    business_email: businessEmail,
    phone,
    industry: input.industry,
    employee_count: input.employeeCount,
    monthly_revenue: input.monthlyRevenue,
    purpose,
    referral_source: input.referralSource || null,
    requested_date: input.date,
    requested_time: requestedTime,
    meeting_start_at: meetingStartAt.toISOString(),
    join_url: joinUrl,
  });
  if (error) return { ok: false, error: error.message };

  const firstName = fullName.split(" ")[0];
  const visitorText =
    `Hi ${firstName},\n\n` +
    `Thanks for booking a demo with Nxelio Nurture! Your demo is confirmed for ${formattedDate} at ${requestedTime}.\n\n` +
    `Join here: ${joinUrl}\n\n` +
    `Looking forward to speaking with you,\nThe Nxelio Nurture Team`;
  await sendEmail({
    to: businessEmail,
    subject: `Your Nxelio Nurture demo is confirmed — ${formattedDate} at ${requestedTime}`,
    text: visitorText,
    fromName: "Nxelio Nurture",
  }).catch(() => {});

  const salesText =
    `New demo request booked via the landing page.\n\n` +
    `Name: ${fullName}\n` +
    `Business email: ${businessEmail}\n` +
    `Phone: ${phone}\n` +
    `Industry: ${input.industry}\n` +
    `Employees: ${input.employeeCount}\n` +
    `Monthly revenue: ${input.monthlyRevenue}\n` +
    `Purpose: ${purpose || "-"}\n` +
    `How they heard about us: ${input.referralSource || "-"}\n` +
    `Requested time: ${formattedDate} at ${requestedTime}\n` +
    `Join link: ${joinUrl}`;
  await sendEmail({
    to: SALES_NOTIFY_EMAIL,
    subject: `New demo booked — ${fullName} (${input.industry})`,
    text: salesText,
    fromName: "Nxelio Nurture",
  }).catch(() => {});

  return { ok: true, joinUrl, formattedDate, formattedTime: requestedTime };
}
