export type LeadStatus = "New" | "Warm" | "Hot" | "Converted" | "Scored";
export type Role = "Admin" | "Manager" | "Sales Rep";

export interface Lead {
  id: string;
  fullName: string;
  email: string;
  companyName: string;
  industry: string;
  interestArea: string;
  source: string;
  phone: string;
  linkedin: string;
  websiteUrl: string;
  leadScore: number;
  status: LeadStatus;
  createdAt: string;
  lastActivity: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  manager?: string;
  status: "Active" | "Inactive";
  createdAt: string;
  lastLogin: string;
  avatar?: string;
}

export interface Segment {
  id: string;
  name: string;
  description: string;
  contacts: number;
  type: "Dynamic" | "Behavioral" | "Engagement";
  createdOn: string;
  status: "Active" | "Paused" | "Draft";
}

export interface Campaign {
  id: string;
  name: string;
  status: "Active" | "Paused" | "Draft" | "Completed";
  leads: number;
  sent: number;
  replyRate: number;
  bounceRate: number;
  openRate: number;
  owner: string;
  lastModified: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  folder: "Lead Generation" | "Customer Support" | "Marketing" | "Internal";
  status: "Active" | "Paused" | "Draft";
  createdAt: string;
  lastUpdated: string;
  executions: number;
}

export const leads: Lead[] = [
  { id: "L-001", fullName: "Anuradha Ramachandran", email: "anu.ramachandran@gmail.com", companyName: "Visionary AI", industry: "Technology", interestArea: "CRM Automation", source: "Website Form", phone: "+1 415 555 0142", linkedin: "linkedin.com/in/anuradha", websiteUrl: "visionary-ai.com", leadScore: 88, status: "Hot", createdAt: "2026-05-20", lastActivity: "2026-05-28" },
  { id: "L-002", fullName: "John Smith", email: "john.smith@abccorp.com", companyName: "ABC Corp", industry: "Consulting", interestArea: "SAP AI", source: "Ebook Download", phone: "+1 212 555 0198", linkedin: "linkedin.com/in/johnsmith", websiteUrl: "abccorp.com", leadScore: 72, status: "Warm", createdAt: "2026-05-18", lastActivity: "2026-05-27" },
  { id: "L-003", fullName: "Priya Sharma", email: "priya@enterprise.io", companyName: "Enterprise Solutions", industry: "Enterprise Software", interestArea: "Digital Transformation", source: "Webinar", phone: "+91 98765 43210", linkedin: "linkedin.com/in/priyasharma", websiteUrl: "enterprise.io", leadScore: 91, status: "Hot", createdAt: "2026-05-22", lastActivity: "2026-05-29" },
  { id: "L-004", fullName: "Michael Chen", email: "m.chen@datacore.com", companyName: "DataCore Analytics", industry: "Analytics", interestArea: "AI Platforms", source: "LinkedIn", phone: "+1 650 555 0177", linkedin: "linkedin.com/in/michaelchen", websiteUrl: "datacore.com", leadScore: 65, status: "Warm", createdAt: "2026-05-15", lastActivity: "2026-05-26" },
  { id: "L-005", fullName: "Sarah Johnson", email: "sarah.j@northwind.com", companyName: "Northwind Traders", industry: "Retail", interestArea: "Customer Engagement", source: "Cold Email", phone: "+1 312 555 0199", linkedin: "linkedin.com/in/sarahjohnson", websiteUrl: "northwind.com", leadScore: 45, status: "New", createdAt: "2026-05-25", lastActivity: "2026-05-25" },
  { id: "L-006", fullName: "Raj Patel", email: "raj.patel@cloudshift.io", companyName: "CloudShift", industry: "Cloud Services", interestArea: "Workflow Automation", source: "Referral", phone: "+1 408 555 0123", linkedin: "linkedin.com/in/rajpatel", websiteUrl: "cloudshift.io", leadScore: 79, status: "Hot", createdAt: "2026-05-12", lastActivity: "2026-05-28" },
  { id: "L-007", fullName: "Emily Davis", email: "emily@nexustech.com", companyName: "Nexus Tech", industry: "Technology", interestArea: "AI Personalization", source: "Webinar", phone: "+1 503 555 0188", linkedin: "linkedin.com/in/emilydavis", websiteUrl: "nexustech.com", leadScore: 58, status: "Warm", createdAt: "2026-05-19", lastActivity: "2026-05-24" },
  { id: "L-008", fullName: "Daniel Kim", email: "d.kim@brightpath.co", companyName: "BrightPath Coaching", industry: "Training", interestArea: "Lead Nurturing", source: "Website Form", phone: "+1 206 555 0142", linkedin: "linkedin.com/in/danielkim", websiteUrl: "brightpath.co", leadScore: 95, status: "Converted", createdAt: "2026-05-08", lastActivity: "2026-05-29" },
  { id: "L-009", fullName: "Lisa Wang", email: "lisa.wang@globex.com", companyName: "Globex Industries", industry: "Manufacturing", interestArea: "Lead Scoring", source: "Cold Email", phone: "+1 713 555 0134", linkedin: "linkedin.com/in/lisawang", websiteUrl: "globex.com", leadScore: 38, status: "New", createdAt: "2026-05-26", lastActivity: "2026-05-26" },
  { id: "L-010", fullName: "Carlos Mendez", email: "carlos@advanta.es", companyName: "Advanta Group", industry: "Consulting", interestArea: "SAP AI", source: "Ebook Download", phone: "+34 91 555 0111", linkedin: "linkedin.com/in/carlosmendez", websiteUrl: "advanta.es", leadScore: 82, status: "Hot", createdAt: "2026-05-17", lastActivity: "2026-05-28" },
];

export const users: User[] = [
  { id: "U-001", fullName: "Anuradha Ramachandran", email: "anu@leadpro.ai", role: "Admin", status: "Active", createdAt: "2026-01-15", lastLogin: "2026-05-29" },
  { id: "U-002", fullName: "James Wilson", email: "james.w@leadpro.ai", role: "Manager", status: "Active", createdAt: "2026-02-10", lastLogin: "2026-05-28" },
  { id: "U-003", fullName: "Sophie Turner", email: "sophie@leadpro.ai", role: "Manager", status: "Active", createdAt: "2026-02-22", lastLogin: "2026-05-29" },
  { id: "U-004", fullName: "Ryan Park", email: "ryan@leadpro.ai", role: "Sales Rep", manager: "James Wilson", status: "Active", createdAt: "2026-03-05", lastLogin: "2026-05-29" },
  { id: "U-005", fullName: "Aisha Khan", email: "aisha@leadpro.ai", role: "Sales Rep", manager: "James Wilson", status: "Active", createdAt: "2026-03-12", lastLogin: "2026-05-27" },
  { id: "U-006", fullName: "Diego Silva", email: "diego@leadpro.ai", role: "Sales Rep", manager: "Sophie Turner", status: "Active", createdAt: "2026-04-01", lastLogin: "2026-05-28" },
  { id: "U-007", fullName: "Hannah Lee", email: "hannah@leadpro.ai", role: "Sales Rep", manager: "Sophie Turner", status: "Inactive", createdAt: "2026-04-15", lastLogin: "2026-05-20" },
];

export const segments: Segment[] = [
  { id: "S-001", name: "SAP Professionals", description: "Decision makers in SAP consulting firms", contacts: 1248, type: "Dynamic", createdOn: "2026-04-10", status: "Active" },
  { id: "S-002", name: "CIO / IT Leaders", description: "C-level technology executives", contacts: 387, type: "Behavioral", createdOn: "2026-04-15", status: "Active" },
  { id: "S-003", name: "Webinar Attendees", description: "Attended at least one webinar in last 90 days", contacts: 892, type: "Engagement", createdOn: "2026-04-22", status: "Active" },
  { id: "S-004", name: "Content Downloaders", description: "Downloaded any ebook or guide", contacts: 2104, type: "Behavioral", createdOn: "2026-05-01", status: "Active" },
  { id: "S-005", name: "High Intent CRM Leads", description: "Score > 70 + visited pricing page", contacts: 156, type: "Dynamic", createdOn: "2026-05-10", status: "Active" },
  { id: "S-006", name: "Cold Re-engagement", description: "No engagement for 60+ days", contacts: 645, type: "Engagement", createdOn: "2026-05-15", status: "Paused" },
  { id: "S-007", name: "Enterprise Manufacturing", description: "Manufacturing companies > 1000 employees", contacts: 78, type: "Dynamic", createdOn: "2026-05-20", status: "Draft" },
];

export const campaigns: Campaign[] = [
  { id: "C-001", name: "SAP AI Transformation — Q2", status: "Active", leads: 1248, sent: 3744, replyRate: 12.4, bounceRate: 2.1, openRate: 48.2, owner: "Anuradha", lastModified: "2026-05-28" },
  { id: "C-002", name: "Webinar Follow-up Sequence", status: "Active", leads: 892, sent: 2676, replyRate: 18.7, bounceRate: 1.4, openRate: 56.1, owner: "James Wilson", lastModified: "2026-05-27" },
  { id: "C-003", name: "Cold Outreach — CIO List", status: "Paused", leads: 387, sent: 1161, replyRate: 8.2, bounceRate: 3.5, openRate: 38.4, owner: "Sophie Turner", lastModified: "2026-05-25" },
  { id: "C-004", name: "Welcome Letter — New Signups", status: "Active", leads: 524, sent: 524, replyRate: 22.1, bounceRate: 0.8, openRate: 71.2, owner: "Ryan Park", lastModified: "2026-05-29" },
  { id: "C-005", name: "Product Launch Announcement", status: "Draft", leads: 0, sent: 0, replyRate: 0, bounceRate: 0, openRate: 0, owner: "Anuradha", lastModified: "2026-05-29" },
  { id: "C-006", name: "Re-engagement Sequence", status: "Completed", leads: 645, sent: 1935, replyRate: 6.4, bounceRate: 4.2, openRate: 32.8, owner: "Aisha Khan", lastModified: "2026-05-15" },
];

export const workflows: Workflow[] = [
  { id: "W-001", name: "Lead Capture & Welcome Email", description: "Triggered when new lead submits website form", folder: "Lead Generation", status: "Active", createdAt: "2026-04-01", lastUpdated: "2026-05-28", executions: 1428 },
  { id: "W-002", name: "Webinar Registration Flow", description: "Confirmation + reminders + follow-up", folder: "Marketing", status: "Active", createdAt: "2026-04-05", lastUpdated: "2026-05-26", executions: 892 },
  { id: "W-003", name: "Hot Lead Alert", description: "Notify sales when score crosses 80", folder: "Lead Generation", status: "Active", createdAt: "2026-04-12", lastUpdated: "2026-05-20", executions: 247 },
  { id: "W-004", name: "Re-Engagement Sequence", description: "Inactive 30 days → automated nurture", folder: "Marketing", status: "Active", createdAt: "2026-04-18", lastUpdated: "2026-05-22", executions: 645 },
  { id: "W-005", name: "Support Ticket Routing", description: "Auto-assign tickets based on category", folder: "Customer Support", status: "Paused", createdAt: "2026-04-22", lastUpdated: "2026-05-10", executions: 134 },
  { id: "W-006", name: "Internal Daily Report", description: "Email summary of leads to managers", folder: "Internal", status: "Active", createdAt: "2026-05-01", lastUpdated: "2026-05-28", executions: 28 },
];

export const activities = [
  { id: "A-001", lead: "Anuradha Ramachandran", action: "Visited pricing page", time: "2 mins ago", type: "page" },
  { id: "A-002", lead: "Priya Sharma", action: "Opened campaign email", time: "12 mins ago", type: "email" },
  { id: "A-003", lead: "John Smith", action: "Downloaded SAP AI Guide", time: "1 hour ago", type: "download" },
  { id: "A-004", lead: "Daniel Kim", action: "Booked consultation", time: "2 hours ago", type: "meeting" },
  { id: "A-005", lead: "Michael Chen", action: "Clicked CTA link", time: "3 hours ago", type: "click" },
  { id: "A-006", lead: "Carlos Mendez", action: "Attended webinar", time: "4 hours ago", type: "webinar" },
  { id: "A-007", lead: "Emily Davis", action: "Replied to email", time: "6 hours ago", type: "email" },
  { id: "A-008", lead: "Raj Patel", action: "Lead score updated to 79", time: "8 hours ago", type: "score" },
];

export const leadGrowthData = [
  { date: "Jan", leads: 245, hot: 32 },
  { date: "Feb", leads: 312, hot: 48 },
  { date: "Mar", leads: 428, hot: 71 },
  { date: "Apr", leads: 567, hot: 92 },
  { date: "May", leads: 742, hot: 124 },
];

export const campaignPerfData = [
  { name: "SAP AI Q2", openRate: 48, replyRate: 12 },
  { name: "Webinar F/U", openRate: 56, replyRate: 19 },
  { name: "CIO Cold", openRate: 38, replyRate: 8 },
  { name: "Welcome", openRate: 71, replyRate: 22 },
  { name: "Re-engage", openRate: 33, replyRate: 6 },
];

export const conversionFunnel = [
  { stage: "New Leads", value: 2847, fill: "#3b82f6" },
  { stage: "Warm", value: 1248, fill: "#06b6d4" },
  { stage: "Hot", value: 487, fill: "#f59e0b" },
  { stage: "Qualified", value: 184, fill: "#10b981" },
  { stage: "Converted", value: 67, fill: "#8b5cf6" },
];

export const inboxConversations = [
  { id: "M-001", lead: "Priya Sharma", company: "Enterprise Solutions", preview: "Yes, I'd love to schedule a demo for next week. What times work best?", time: "2 mins ago", unread: true, campaign: "SAP AI Q2" },
  { id: "M-002", lead: "John Smith", company: "ABC Corp", preview: "Thanks for the guide. Can you share more about your pricing structure?", time: "1 hour ago", unread: true, campaign: "Webinar F/U" },
  { id: "M-003", lead: "Daniel Kim", company: "BrightPath", preview: "Confirmed for Thursday at 2pm. Looking forward to it.", time: "3 hours ago", unread: false, campaign: "Welcome" },
  { id: "M-004", lead: "Carlos Mendez", company: "Advanta Group", preview: "Not interested at this time. Please remove me from your list.", time: "5 hours ago", unread: false, campaign: "CIO Cold" },
  { id: "M-005", lead: "Emily Davis", company: "Nexus Tech", preview: "Could you send me the case study you mentioned?", time: "1 day ago", unread: false, campaign: "Webinar F/U" },
];

export const emailTemplates = [
  { id: "T-001", name: "Welcome Email", subject: "Welcome to {{companyName}} — let's get started", body: "Hi {{firstName}}, ...", createdBy: "Anuradha", lastModified: "2026-05-28" },
  { id: "T-002", name: "Demo Booking", subject: "Quick question — 15 min demo?", body: "Hi {{firstName}}, I noticed {{companyName}} is in {{industry}}...", createdBy: "James Wilson", lastModified: "2026-05-25" },
  { id: "T-003", name: "Follow-up #2", subject: "Following up on {{topic}}", body: "Hi {{firstName}}, ...", createdBy: "Sophie Turner", lastModified: "2026-05-20" },
  { id: "T-004", name: "Webinar Reminder", subject: "Reminder: {{eventName}} starts in 1 hour", body: "Hi {{firstName}}, ...", createdBy: "Ryan Park", lastModified: "2026-05-18" },
  { id: "T-005", name: "Case Study Share", subject: "How {{caseStudyCompany}} achieved 3x growth", body: "Hi {{firstName}}, ...", createdBy: "Anuradha", lastModified: "2026-05-12" },
];

export const menuPermissions = ["Leads", "Campaign", "Segment", "Workflow", "Templates", "Analytics"];
export const permissionActions = ["Create", "Upload", "Delete", "Edit", "View"];

export const industries = ["Technology", "Consulting", "Enterprise Software", "Analytics", "Retail", "Cloud Services", "Manufacturing", "Training", "Healthcare", "Finance"];
export const interestAreas = ["CRM Automation", "SAP AI", "Digital Transformation", "AI Platforms", "Customer Engagement", "Workflow Automation", "AI Personalization", "Lead Nurturing", "Lead Scoring"];
