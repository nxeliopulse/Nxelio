"use client";
import { useState } from "react";
import {
  Search,
  Rocket,
  Users2,
  Sparkles,
  Plug,
  ChevronDown,
  Mail,
  BookOpen,
  Code,
  PlayCircle,
  MessagesSquare,
  CheckCircle2,
} from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

const categories = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Set up your workspace and import your first leads",
    icon: Rocket,
    color: "from-blue-500 to-indigo-600",
    articles: [
      "Welcome to LeadPro",
      "Setting up your workspace",
      "Inviting team members",
      "Importing your first leads",
      "Creating your first campaign",
    ],
  },
  {
    id: "leads",
    title: "Leads & Campaigns",
    description: "Manage prospects and run multi-step outreach",
    icon: Users2,
    color: "from-emerald-500 to-teal-600",
    articles: [
      "Lead scoring explained",
      "Building segments with filters",
      "Designing a multi-touch campaign",
      "A/B testing email subject lines",
      "Pausing and editing live campaigns",
    ],
  },
  {
    id: "ai",
    title: "AI Features",
    description: "Generate emails, score leads, and surface insights",
    icon: Sparkles,
    color: "from-purple-500 to-pink-600",
    articles: [
      "Choosing the right AI model",
      "Tuning the AI tone and persona",
      "AI-generated email best practices",
      "Understanding the lead score breakdown",
      "Managing your AI credits",
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Connect Resend, Supabase, Groq, and your CRM",
    icon: Plug,
    color: "from-amber-500 to-orange-600",
    articles: [
      "Verifying your sender domain in Resend",
      "Rotating API keys safely",
      "Syncing leads with HubSpot",
      "Outbound webhooks (coming soon)",
      "REST API quickstart",
    ],
  },
];

const faqs = [
  {
    q: "How do I import leads from a CSV?",
    a: "Open the Leads page, click 'Import' in the top-right, and upload a CSV with at least an email column. LeadPro will auto-map common fields like name, company, and title. You can review the mapping before committing the import.",
  },
  {
    q: "Where do I configure AI?",
    a: "AI is powered by Groq. Set your GROQ_API_KEY environment variable in your hosting platform (or .env.local for development). Settings > API Keys shows whether AI is connected. AI features automatically use the connected model across Lead Detail, Campaign Builder, and Inbox.",
  },
  {
    q: "How does lead scoring work?",
    a: "Lead scores (0-100) blend firmographic fit (industry, headcount, role), engagement signals (opens, replies, page visits), and AI-derived buying intent. You can re-score any lead manually from the Lead Detail page, and high-scoring leads automatically appear in your 'Hot leads' segment.",
  },
  {
    q: "Can I send emails to anyone?",
    a: "By default, Resend is in sandbox mode — emails only deliver to the verified account owner. To send to your real prospects, verify a sending domain at resend.com/domains, then set EMAIL_DOMAIN_VERIFIED=true and update EMAIL_FROM to use your verified domain. Once verified, all campaigns and one-off sends route through your domain.",
  },
  {
    q: "How do I customize email templates?",
    a: "Go to Templates in the sidebar. You can create reusable HTML or plain-text templates with merge tags like {{lead.first_name}} and {{lead.company}}. Templates are available in Campaigns and the Send Email modal on each lead.",
  },
  {
    q: "What integrations are supported?",
    a: "LeadPro ships with Groq (AI), Resend (email), and Supabase (database, auth, storage) wired in. HubSpot CRM sync is optional and configurable in Settings > API Keys. A general REST API and webhooks are on the roadmap.",
  },
];

const docs = [
  {
    title: "README",
    description: "Project overview and local setup",
    icon: BookOpen,
    href: "https://github.com",
  },
  {
    title: "API docs",
    description: "REST endpoints and authentication",
    icon: Code,
    href: "#",
  },
  {
    title: "Video tutorials",
    description: "Watch 5-minute feature walkthroughs",
    icon: PlayCircle,
    href: "#",
  },
  {
    title: "Community",
    description: "Discussions, requests, and answers",
    icon: MessagesSquare,
    href: "#",
  },
];

export function HelpView() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number] | null>(
    null
  );
  const [contactOpen, setContactOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  function closeContact() {
    setContactOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setContactForm({ name: "", email: "", message: "" });
    }, 300);
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title="Help & Support"
        description="Search articles, browse tutorials, and get in touch with our team"
      />

      {/* Hero search */}
      <Card className="overflow-hidden mb-8">
        <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-10 text-white">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold tracking-tight mb-2">
              How can we help you today?
            </h2>
            <p className="text-blue-100 mb-6">
              Search our knowledge base or browse popular topics below
            </p>
            <div className="bg-white rounded-xl p-1">
              <Input
                placeholder="Search articles, tutorials, FAQs..."
                leftIcon={<Search className="h-4 w-4" />}
                className="border-0 h-12"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Category cards */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Browse by category</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c)}
                className="text-left"
              >
                <Card className="p-5 hover:shadow-md transition-shadow h-full">
                  <div
                    className={`h-12 w-12 rounded-xl bg-gradient-to-br ${c.color} text-white flex items-center justify-center mb-3`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1">{c.title}</h3>
                  <p className="text-sm text-slate-500">{c.description}</p>
                </Card>
              </button>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Frequently asked questions</h2>
        <Card>
          <div className="divide-y divide-slate-100">
            {faqs.map((faq, idx) => {
              const open = openFaq === idx;
              return (
                <div key={idx}>
                  <button
                    onClick={() => setOpenFaq(open ? null : idx)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span className="font-medium text-slate-900">{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-400 transition-transform flex-shrink-0 ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {open && (
                    <div className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Contact + Documentation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-6 lg:col-span-1 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
          <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center mb-3">
            <Mail className="h-5 w-5" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Need more help?</h3>
          <p className="text-sm text-slate-600 mb-4">
            Our support team typically replies within a few hours during business days.
          </p>
          <div className="space-y-2">
            <a
              href="mailto:support@leadpro.ai"
              className="text-sm font-medium text-blue-700 hover:underline block"
            >
              support@leadpro.ai
            </a>
            <Button onClick={() => setContactOpen(true)} className="w-full mt-2">
              Send a message
            </Button>
          </div>
        </Card>

        <div className="lg:col-span-2">
          <h3 className="font-semibold text-slate-900 mb-3">Documentation</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {docs.map((d) => {
              const Icon = d.icon;
              return (
                <a key={d.title} href={d.href} target="_blank" rel="noopener noreferrer">
                  <Card className="p-4 hover:shadow-md transition-shadow h-full">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{d.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>
                      </div>
                    </div>
                  </Card>
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category modal */}
      <Modal
        open={activeCategory !== null}
        onClose={() => setActiveCategory(null)}
        title={activeCategory?.title}
        description={activeCategory?.description}
        size="md"
      >
        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Popular articles
          </p>
          <ul className="space-y-1">
            {activeCategory?.articles.map((a) => (
              <li key={a}>
                <a
                  href="#"
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 text-sm text-slate-700"
                >
                  <span>{a}</span>
                  <span className="text-xs text-slate-400">Article</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {/* Contact modal */}
      <Modal
        open={contactOpen}
        onClose={closeContact}
        title="Contact support"
        description="We&apos;ll get back to you within one business day"
        size="md"
      >
        {submitted ? (
          <div className="p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-1">Message sent</h4>
            <p className="text-sm text-slate-600 mb-5">
              Thanks for reaching out. Our team will get back to you at{" "}
              <strong>{contactForm.email || "the email you provided"}</strong> shortly.
            </p>
            <Button onClick={closeContact}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Your name
              </label>
              <Input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                required
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <Input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                required
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Message
              </label>
              <Textarea
                value={contactForm.message}
                onChange={(e) =>
                  setContactForm({ ...contactForm, message: e.target.value })
                }
                required
                className="min-h-[120px]"
                placeholder="Tell us what's going on..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeContact}>
                Cancel
              </Button>
              <Button type="submit">Send message</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
