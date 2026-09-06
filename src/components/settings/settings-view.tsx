"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Ban, Check, Trash2, AlertCircle, CheckCircle2, Palette, Mail, Calendar, ScrollText, Sliders, X, ExternalLink, Building2, Globe, Sparkles } from "lucide-react";
import { Linkedin } from "@/components/outreach/linkedin-icon";
import type { CalendarAccountRow } from "@/lib/queries/calendar-accounts";
import type { ZoomAccountRow } from "@/lib/queries/zoom-accounts";
import type { HubspotAccountRow } from "@/lib/queries/hubspot-accounts";
import { HubspotConnection } from "@/components/settings/hubspot-connection";
import { syncOutreachAccounts, type OutreachAccountRow } from "@/lib/queries/outreach-accounts";
import type { AuditLogRow } from "@/lib/queries/audit-log";
import type { SendLimitRow } from "@/lib/queries/outreach-send-limits";
import { EmailConnectorView, LinkedInConnectorView, CalendarConnectorView } from "@/components/settings/connectors-view";
import { AuditLogView } from "@/components/settings/audit-log-view";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { updateProfile, updatePassword } from "@/lib/queries/profile";
import { saveOnboarding, type OnboardingData } from "@/lib/queries/onboarding";
import type { CompanyScoreResult } from "@/lib/queries/company-score";
import { generateCompanyScore } from "@/lib/ai/actions";
import { cn } from "@/lib/utils";
import { addBlocklistEntry, removeBlocklistEntry, type BlocklistEntry } from "@/lib/queries/blocklist";
import {
  getStoredAppearance,
  applyAppearance,
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type Theme,
  type FontSize,
  type FontStyle,
  type LightPreset,
  type DarkPreset,
  type AccentColor,
  type SidebarBadgeStyle,
  type SidebarDensity,
  type MixedColorPreset,
} from "@/lib/theme";

const sections = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { id: "linkedin", label: "LinkedIn", icon: <Linkedin className="h-4 w-4" /> },
  { id: "calendar", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
  { id: "integrations", label: "Integrations", icon: <ExternalLink className="h-4 w-4" /> },
  { id: "blocklist", label: "Blocklist", icon: <Ban className="h-4 w-4" /> },
];
const AUDIT_SECTION = { id: "audit", label: "Audit Log", icon: <ScrollText className="h-4 w-4" /> };

interface Profile {
  full_name: string;
  email: string;
  roles?: { role_name?: string };
}

interface Props {
  profile: Profile | null;
  emailDomain: { verified: boolean; from: string; provider?: "brevo" | "none" };
  blocklist: BlocklistEntry[];
  calendarAccounts: CalendarAccountRow[];
  calendarProviderStatus: { google: boolean; microsoft: boolean; zoho: boolean };
  zoomAccounts: ZoomAccountRow[];
  zoomConfigured: boolean;
  mailboxAccounts: OutreachAccountRow[];
  linkedinAccounts: OutreachAccountRow[];
  unipileConfigured: boolean;
  bookingSlug?: string | null;
  isSuperAdmin: boolean;
  auditLog: AuditLogRow[];
  emailSendLimit: SendLimitRow | null;
  linkedinSendLimit: SendLimitRow | null;
  hubspotAccount: HubspotAccountRow | null;
  hubspotProviderConfigured: boolean;
  /** From onboarding — null only if the workspace never completed onboarding. */
  business: OnboardingData | null;
  /** The workspace's last-generated Company Score, or null if none yet. */
  companyScore: CompanyScoreResult | null;
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? "bg-blue-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function CustomSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (val: T) => void;
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-medium py-1.5 pl-3 pr-8 rounded-lg border border-slate-200 cursor-pointer focus:outline-none transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-white text-slate-900 py-1">
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
        </svg>
      </div>
    </div>
  );
}

const ACCENT_COLORS: { id: AccentColor; name: string; bg: string }[] = [
  { id: "vermilion", name: "Vermilion", bg: "bg-[#E41F07]" },
  { id: "black", name: "Onyx Black", bg: "bg-[#22252a]" },
  { id: "blue", name: "Blue", bg: "bg-blue-600" },
  { id: "indigo", name: "Indigo", bg: "bg-indigo-600" },
  { id: "teal", name: "Cyan Teal", bg: "bg-[#18A7B8]" },
  { id: "emerald", name: "Emerald", bg: "bg-emerald-600" },
];

export function SettingsView({ profile, emailDomain, blocklist, calendarAccounts, calendarProviderStatus, zoomAccounts, zoomConfigured, mailboxAccounts, linkedinAccounts, unipileConfigured, bookingSlug, isSuperAdmin, auditLog, emailSendLimit, linkedinSendLimit, hubspotAccount, hubspotProviderConfigured, business, companyScore: initialCompanyScore }: Props) {
  const router = useRouter();
  const [active, setActive] = useState("profile");
  const visibleSections = isSuperAdmin ? [...sections, AUDIT_SECTION] : sections;

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    if (s && visibleSections.some((sec) => sec.id === s)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
      setActive(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; visibleSections is derived from a prop that doesn't change after mount
  }, []);

  useEffect(() => {
    const connected = new URLSearchParams(window.location.search).get("connected");
    if (connected !== "email" && connected !== "linkedin") return;
    syncOutreachAccounts().then(() => {
      window.history.replaceState(null, "", `/settings?section=${connected}`);
      router.refresh();
      // This page is very likely the OAuth popup tab landing back after a
      // connect flow (see linkedin-connections.tsx / mailbox-connections.tsx's
      // window.open) — close it so the user ends up back on the tab they
      // started from instead of an extra tab they have to close manually.
      // A no-op if this tab wasn't opened by a script (e.g. a direct visit).
      window.close();
    });
  }, [router]);

  // The connect popup lands in a different tab/React tree, so it can't push
  // state back to THIS tab directly — re-sync on regaining focus, since the
  // user switching back after authorizing is the actual signal we have.
  useEffect(() => {
    function onFocus() {
      syncOutreachAccounts().then(() => router.refresh());
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);

  const [pending, start] = useTransition();
  const [name, setName] = useState(profile?.full_name || "");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState(business?.company_name || "");
  const [companyWebsite, setCompanyWebsite] = useState(business?.company_website || "");
  const [businessMsg, setBusinessMsg] = useState<string | null>(null);
  const [businessErr, setBusinessErr] = useState<string | null>(null);

  const [companyScore, setCompanyScore] = useState(initialCompanyScore);
  const [scoringPending, startScoring] = useTransition();
  const [scoringErr, setScoringErr] = useState<string | null>(null);

  const [blockInput, setBlockInput] = useState("");
  const [blockErr, setBlockErr] = useState<string | null>(null);

  // Appearance State
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [showSidebarModal, setShowSidebarModal] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage on mount (SSR has no access to it)
    setAppearance(getStoredAppearance());
  }, []);

  function updateAppearance(partial: Partial<AppearanceSettings>) {
    setAppearance((prev) => {
      const next = { ...prev, ...partial };
      applyAppearance(next);
      return next;
    });
  }

  function saveProfile() {
    setProfileMsg(null); setProfileErr(null);
    start(async () => {
      try {
        await updateProfile({ full_name: name.trim() });
        setProfileMsg("Profile updated");
      } catch (err) {
        setProfileErr(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function saveBusinessDetails() {
    setBusinessMsg(null); setBusinessErr(null);
    start(async () => {
      try {
        // saveOnboarding overwrites the whole onboarding blob, so merge onto
        // whatever else was already collected (industry, goals, etc.)
        // instead of clobbering it — business may be null if this workspace
        // somehow never completed onboarding at all.
        const res = await saveOnboarding({
          ...(business ?? { company_name: "", industry: "", goals: [], target_customer_type: "", primary_product: "" }),
          company_name: companyName.trim(),
          company_website: companyWebsite.trim(),
        });
        if (!res.ok) { setBusinessErr(res.error || "Failed"); return; }
        setBusinessMsg("Business details updated");
      } catch (err) {
        setBusinessErr(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function generateCompanyScoreNow() {
    setScoringErr(null);
    startScoring(async () => {
      try {
        const result = await generateCompanyScore();
        setCompanyScore(result);
      } catch (err) {
        setScoringErr(err instanceof Error ? err.message : "Couldn't generate a score.");
      }
    });
  }

  function changePassword() {
    setPwMsg(null); setPwErr(null);
    if (newPw.length < 8) { setPwErr("Password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwErr("Passwords don't match"); return; }
    start(async () => {
      try {
        await updatePassword(newPw);
        setPwMsg("Password updated");
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
      } catch (err) {
        setPwErr(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function addBlock() {
    setBlockErr(null);
    if (!blockInput.trim()) return;
    start(async () => {
      try {
        await addBlocklistEntry(blockInput.trim());
        setBlockInput("");
      } catch (err) {
        setBlockErr(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  function removeBlock(id: string) {
    start(async () => { await removeBlocklistEntry(id); });
  }

  const roleName = profile?.roles?.role_name || "—";

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Settings" description="Configure your account, integrations, and platform preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5 sm:gap-6">
        {/* Navigation: Horizontal scrollable strip on mobile/tablet, vertical sidebar card on lg+ */}
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 lg:overflow-visible flex-shrink-0">
          <div className="flex lg:flex-col gap-1 p-1.5 rounded-2xl bg-white dark:bg-[#1b212e] border border-slate-200 dark:border-slate-800 shadow-xs min-w-max lg:min-w-0">
            {visibleSections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                  active === s.id
                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 min-w-0">
          {active === "profile" && (
            <>
              <Card className="p-4 sm:p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Profile</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Update your personal information</p>

                {profileMsg && <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-700 dark:text-emerald-300 mb-4"><CheckCircle2 className="h-4 w-4 mt-0.5" />{profileMsg}</div>}
                {profileErr && <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 mb-4"><AlertCircle className="h-4 w-4 mt-0.5" />{profileErr}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Full name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
                    <Input defaultValue={profile?.email || ""} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                    <Input defaultValue={roleName} disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Timezone</label>
                    <Select>
                      <option>America / Los Angeles</option>
                      <option>America / New York</option>
                      <option>Asia / Kolkata</option>
                      <option>Europe / London</option>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-5">
                  <Button variant="outline" onClick={() => setName(profile?.full_name || "")} disabled={pending}>Cancel</Button>
                  <Button onClick={saveProfile} disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
                </div>
              </Card>

              <Card className="p-4 sm:p-6">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Business Details</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Your company info from onboarding, plus an AI read of your business</p>

                {businessMsg && <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-sm text-emerald-700 dark:text-emerald-300 mb-4"><CheckCircle2 className="h-4 w-4 mt-0.5" />{businessMsg}</div>}
                {businessErr && <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300 mb-4"><AlertCircle className="h-4 w-4 mt-0.5" />{businessErr}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Company name</label>
                    <Input leftIcon={<Building2 className="h-3.5 w-3.5 text-slate-400" />} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Company website</label>
                    <Input leftIcon={<Globe className="h-3.5 w-3.5 text-slate-400" />} value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} placeholder="acme.com" />
                  </div>
                </div>

                <div className="flex justify-end gap-2 mb-5">
                  <Button variant="outline" onClick={() => { setCompanyName(business?.company_name || ""); setCompanyWebsite(business?.company_website || ""); }} disabled={pending}>Cancel</Button>
                  <Button onClick={saveBusinessDetails} disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "h-11 w-11 rounded-full text-white flex items-center justify-center flex-shrink-0",
                      !companyScore ? "bg-slate-400" : companyScore.score >= 70 ? "bg-rose-500" : companyScore.score >= 40 ? "bg-amber-500" : "bg-blue-500"
                    )}>
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500 dark:text-slate-500">Company Score</p>
                      {companyScore ? (
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          {companyScore.score}<span className="text-sm font-normal text-slate-400"> / 100</span>
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Not generated yet</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={generateCompanyScoreNow}
                      disabled={scoringPending}
                      title="Uses 1 AI credit"
                    >
                      {scoringPending ? "Analyzing…" : companyScore ? "Refresh (1 credit)" : "Generate score (1 credit)"}
                    </Button>
                  </div>

                  {scoringErr && <p className="text-sm text-red-600 dark:text-red-400 mt-3">{scoringErr}</p>}

                  {companyScore && (
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <p className="text-sm text-slate-700 dark:text-slate-300">{companyScore.summary}</p>
                      {!companyScore.websiteFetched && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">Couldn&apos;t read your website — this score is based on your onboarding profile only. Check the website field above.</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {companyScore.strengths.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-1.5">Strengths</p>
                            <ul className="space-y-1">
                              {companyScore.strengths.map((s, i) => (
                                <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex gap-1.5"><span className="text-emerald-500">•</span>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {companyScore.risks.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1.5">Risks / gaps</p>
                            <ul className="space-y-1">
                              {companyScore.risks.map((r, i) => (
                                <li key={i} className="text-sm text-slate-600 dark:text-slate-400 flex gap-1.5"><span className="text-amber-500">•</span>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">Generated {new Date(companyScore.generatedAt).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-1">Change password</h3>
                <p className="text-sm text-slate-500 mb-5">Update your account password (minimum 8 characters)</p>

                {pwMsg && <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 mb-4"><CheckCircle2 className="h-4 w-4 mt-0.5" />{pwMsg}</div>}
                {pwErr && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4"><AlertCircle className="h-4 w-4 mt-0.5" />{pwErr}</div>}

                <div className="space-y-3 max-w-md">
                  <Input type="password" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                  <Input type="password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                  <Input type="password" placeholder="Confirm new password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                  <Button onClick={changePassword} disabled={pending}>{pending ? "Updating..." : "Update password"}</Button>
                </div>
              </Card>
            </>
          )}

          {active === "appearance" && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Interface and theme</h2>
              </div>

              {/* Card 1: General Display Settings */}
              <Card className="p-0 overflow-hidden divide-y divide-slate-200">
                {/* Row 1: App sidebar */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">App sidebar</h4>
                    <p className="text-xs text-slate-500">Customize sidebar item visibility, ordering, and badge style</p>
                  </div>
                  <button
                    onClick={() => setShowSidebarModal(true)}
                    className="text-sm font-medium text-slate-700 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Customize
                  </button>
                </div>

                {/* Row 2: Font size */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Font size</h4>
                    <p className="text-xs text-slate-500">Adjust the size of text across the app</p>
                  </div>
                  <CustomSelect<FontSize>
                    value={appearance.fontSize}
                    onChange={(val) => updateAppearance({ fontSize: val })}
                    options={[
                      { value: "default", label: "Default" },
                      { value: "compact", label: "Compact" },
                      { value: "large", label: "Large" },
                      { value: "xl", label: "Extra Large" },
                    ]}
                  />
                </div>

                {/* Row 3: Font style */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Font style</h4>
                    <p className="text-xs text-slate-500">Customize typography and font family for the application interface</p>
                  </div>
                  <CustomSelect<FontStyle>
                    value={appearance.fontStyle || "segoe_ui"}
                    onChange={(val) => updateAppearance({ fontStyle: val })}
                    options={[
                      { value: "golos", label: "Golos Text" },
                      { value: "sans", label: "Geist Sans" },
                      { value: "inter", label: "Inter (Modern Sans)" },
                      { value: "roboto", label: "Roboto (Classic)" },
                      { value: "outfit", label: "Outfit (Geometric)" },
                      { value: "rounded", label: "Plus Jakarta (Rounded)" },
                      { value: "serif", label: "Georgia (Editorial Serif)" },
                      { value: "mono", label: "Fira Code (Monospace)" },
                      { value: "arial", label: "Arial" },
                      { value: "calibri", label: "Calibri" },
                      { value: "tahoma", label: "Tahoma" },
                      { value: "segoe_ui", label: "Segoe UI (Default)" },
                    ]}
                  />
                </div>

                {/* Row 3: Use pointer cursors */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Use pointer cursors</h4>
                    <p className="text-xs text-slate-500">Change the cursor to a pointer when hovering over any interactive elements</p>
                  </div>
                  <ToggleSwitch
                    checked={appearance.pointerCursors}
                    onChange={(v) => updateAppearance({ pointerCursors: v })}
                  />
                </div>

                {/* Row 4: Underline links */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Underline links</h4>
                    <p className="text-xs text-slate-500">Always underline links in text content</p>
                  </div>
                  <ToggleSwitch
                    checked={appearance.underlineLinks}
                    onChange={(v) => updateAppearance({ underlineLinks: v })}
                  />
                </div>
              </Card>

              {/* Card 2: Interface theme Settings */}
              <Card className="p-0 overflow-hidden divide-y divide-slate-200">
                {/* Row 1: Interface theme */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Interface theme</h4>
                    <p className="text-xs text-slate-500">Select or customize your interface color scheme</p>
                  </div>
                  <CustomSelect<Theme>
                    value={appearance.theme}
                    onChange={(val) => updateAppearance({ theme: val })}
                    options={[
                      { value: "system", label: "• Aa System preference" },
                      { value: "dark", label: "• Aa Dark" },
                      { value: "light", label: "• Aa Light" },
                    ]}
                  />
                </div>

                {/* Row 2: Light */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Light</h4>
                    <p className="text-xs text-slate-500">Theme to use for light system appearance</p>
                  </div>
                  <CustomSelect<LightPreset>
                    value={appearance.lightPreset}
                    onChange={(val) => updateAppearance({ lightPreset: val })}
                    options={[
                      { value: "light", label: "• Aa Light" },
                      { value: "warm", label: "• Aa Warm Cream" },
                      { value: "slate", label: "• Aa Soft Slate" },
                    ]}
                  />
                </div>

                {/* Row 3: Dark */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Dark</h4>
                    <p className="text-xs text-slate-500">Theme to use for dark system appearance</p>
                  </div>
                  <CustomSelect<DarkPreset>
                    value={appearance.darkPreset}
                    onChange={(val) => updateAppearance({ darkPreset: val })}
                    options={[
                      { value: "dark", label: "• Aa Dark" },
                      { value: "midnight", label: "• Aa Midnight Blue" },
                      { value: "obsidian", label: "• Aa Obsidian" },
                      { value: "emerald", label: "• Aa Emerald Dark" },
                    ]}
                  />
                </div>

                {/* Row 4: Mixed-color theme */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Mixed-color theme</h4>
                    <p className="text-xs text-slate-500">Professional sidebar and topbar color combinations</p>
                  </div>
                  <CustomSelect<MixedColorPreset>
                    value={appearance.mixedColorPreset || "none"}
                    onChange={(val) => updateAppearance({ mixedColorPreset: val })}
                    options={[
                      { value: "none", label: "None (Use Accent)" },
                      { value: "teal_aqua", label: "Teal + Aqua (Fresh & Professional)" },
                      { value: "green_lime", label: "Green + Lime (Growth & Success)" },
                      { value: "purple_lavender", label: "Purple + Lavender" },
                      { value: "indigo_purple", label: "Indigo + Purple" },
                      { value: "emerald_teal", label: "Emerald + Teal" },
                      { value: "amber_orange", label: "Amber + Orange" },
                      { value: "rose_pink", label: "Rose + Pink" },
                      { value: "slate_blue", label: "Slate + Blue" },
                      { value: "charcoal_lime", label: "Charcoal + Lime" },
                      { value: "charcoal_yellow", label: "Charcoal + Yellow" },
                      { value: "coral_peach", label: "Coral + Peach" },
                      { value: "sand_olive", label: "Sand + Olive" },
                    ]}
                  />
                </div>

                {/* Row 4: Accent color swatches */}
                <div className="flex items-center justify-between p-5">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="text-sm font-semibold text-slate-900">Accent color</h4>
                    <p className="text-xs text-slate-500">Primary brand color for buttons and highlights</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ACCENT_COLORS.map((col) => (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => updateAppearance({ accentColor: col.id })}
                        title={col.name}
                        className={`h-7 w-7 rounded-full ${col.bg} flex items-center justify-center transition-transform ${
                          appearance.accentColor === col.id ? "ring-2 ring-offset-2 ring-blue-500 scale-110" : "hover:scale-105 opacity-90"
                        }`}
                      >
                        {appearance.accentColor === col.id && <Check className="h-3.5 w-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Sidebar Customization Modal */}
              {showSidebarModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
                  <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-2xl p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900 font-semibold">
                        <Sliders className="h-5 w-5 text-blue-600" />
                        <span>Customize App Sidebar</span>
                      </div>
                      <button
                        onClick={() => setShowSidebarModal(false)}
                        className="text-slate-500 hover:text-slate-700 rounded-lg p-1"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                          Badge Style
                        </label>
                        <CustomSelect<SidebarBadgeStyle>
                          value={appearance.sidebarBadgeStyle}
                          onChange={(val) => updateAppearance({ sidebarBadgeStyle: val })}
                          options={[
                            { value: "default", label: "Default Pill" },
                            { value: "numeric", label: "Numeric Count" },
                            { value: "dot", label: "Indicator Dot" },
                            { value: "hidden", label: "Hidden" },
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                          Sidebar Density
                        </label>
                        <CustomSelect<SidebarDensity>
                          value={appearance.sidebarDensity}
                          onChange={(val) => updateAppearance({ sidebarDensity: val })}
                          options={[
                            { value: "default", label: "Comfortable" },
                            { value: "compact", label: "Compact" },
                          ]}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button onClick={() => setShowSidebarModal(false)}>Done</Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {active === "email" && (
            <EmailConnectorView
              isSuperAdmin={isSuperAdmin}
              emailSendingActive={emailDomain.verified}
              mailboxAccounts={mailboxAccounts}
              connectorReady={unipileConfigured}
              sendLimit={emailSendLimit}
            />
          )}

          {active === "linkedin" && (
            <LinkedInConnectorView
              isSuperAdmin={isSuperAdmin}
              linkedinAccounts={linkedinAccounts}
              connectorReady={unipileConfigured}
              sendLimit={linkedinSendLimit}
            />
          )}

          {active === "calendar" && (
            <CalendarConnectorView
              isSuperAdmin={isSuperAdmin}
              calendarAccounts={calendarAccounts}
              calendarProviderStatus={calendarProviderStatus}
              zoomAccounts={zoomAccounts}
              zoomConfigured={zoomConfigured}
              bookingSlug={bookingSlug}
            />
          )}

          {active === "integrations" && (
            <HubspotConnection account={hubspotAccount} configured={hubspotProviderConfigured} />
          )}

          {active === "blocklist" && (
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-1">Blocklist</h3>
              <p className="text-sm text-slate-500 mb-5">Email addresses and domains excluded from all campaigns</p>

              {blockErr && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4"><AlertCircle className="h-4 w-4 mt-0.5" />{blockErr}</div>}

              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="email@example.com or @domain.com"
                  value={blockInput}
                  onChange={(e) => setBlockInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBlock(); } }}
                />
                <Button onClick={addBlock} disabled={pending}>{pending ? "Adding..." : "Add"}</Button>
              </div>

              {blocklist.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">Blocklist is empty.</p>
              ) : (
                <div className="space-y-2">
                  {blocklist.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <code className="text-sm text-slate-700 font-mono">{b.value}</code>
                        {b.reason && <p className="text-xs text-slate-500 mt-0.5">{b.reason}</p>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeBlock(b.id)} disabled={pending}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {active === "audit" && isSuperAdmin && <AuditLogView entries={auditLog} />}
        </div>
      </div>
    </div>
  );
}
