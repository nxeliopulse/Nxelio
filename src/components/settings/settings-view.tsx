"use client";
import { useState, useTransition, useEffect, type ReactNode } from "react";
import { User, Bell, Key, ShieldCheck, Ban, CreditCard, Check, Trash2, AlertCircle, CheckCircle2, ExternalLink, Sparkles, Palette, Sun, Moon, Monitor, Plug, ScrollText } from "lucide-react";
import type { CalendarAccountRow } from "@/lib/queries/calendar-accounts";
import type { OutreachAccountRow } from "@/lib/queries/outreach-accounts";
import type { AuditLogRow } from "@/lib/queries/audit-log";
import { ConnectorsView } from "@/components/settings/connectors-view";
import { AuditLogView } from "@/components/settings/audit-log-view";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { updateProfile, updatePassword } from "@/lib/queries/profile";
import { addBlocklistEntry, removeBlocklistEntry, type BlocklistEntry } from "@/lib/queries/blocklist";
import { getStoredTheme, applyTheme, type Theme } from "@/lib/theme";
import type { IntegrationStatus } from "@/lib/queries/integrations";

const sections = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "connectors", label: "Connectors", icon: <Plug className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { id: "api", label: "API Keys", icon: <Key className="h-4 w-4" /> },
  { id: "blocklist", label: "Blocklist", icon: <Ban className="h-4 w-4" /> },
  { id: "billing", label: "Billing", icon: <CreditCard className="h-4 w-4" /> },
  { id: "security", label: "Security", icon: <ShieldCheck className="h-4 w-4" /> },
];
const AUDIT_SECTION = { id: "audit", label: "Audit Log", icon: <ScrollText className="h-4 w-4" /> };

interface Profile {
  full_name: string;
  email: string;
  roles?: { role_name?: string };
}

interface Props {
  profile: Profile | null;
  integrations: IntegrationStatus[];
  emailDomain: { verified: boolean; from: string; provider?: "brevo" | "none" };
  blocklist: BlocklistEntry[];
  calendarAccounts: CalendarAccountRow[];
  calendarProviderStatus: { google: boolean; microsoft: boolean };
  mailboxAccounts: OutreachAccountRow[];
  linkedinAccounts: OutreachAccountRow[];
  unipileConfigured: boolean;
  bookingSlug?: string | null;
  isSuperAdmin: boolean;
  auditLog: AuditLogRow[];
}

export function SettingsView({ profile, integrations, emailDomain, blocklist, calendarAccounts, calendarProviderStatus, mailboxAccounts, linkedinAccounts, unipileConfigured, bookingSlug, isSuperAdmin, auditLog }: Props) {
  const [active, setActive] = useState("profile");
  const visibleSections = isSuperAdmin ? [...sections, AUDIT_SECTION] : sections;
  // Deep-link support: the calendar OAuth callback redirects back with ?section=calendar
  // (and the mailbox flow used ?section=email) — both now live under "connectors".
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    const resolved = s === "calendar" || s === "email" ? "connectors" : s;
    if (resolved && visibleSections.some((sec) => sec.id === resolved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
      setActive(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pending, start] = useTransition();
  const [name, setName] = useState(profile?.full_name || "");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [blockInput, setBlockInput] = useState("");
  const [blockErr, setBlockErr] = useState<string | null>(null);

  const [notifs, setNotifs] = useState<Record<string, boolean>>({
    hot: true, completion: true, replies: true, digest: true, errors: false, scoring: false,
  });

  const [theme, setThemeState] = useState<Theme>("system");
  // Read the saved theme after mount (localStorage is client-only).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setThemeState(getStoredTheme()); }, []);
  function selectTheme(t: Theme) { applyTheme(t); setThemeState(t); }

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

  const initials = (profile?.full_name || "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  const roleName = profile?.roles?.role_name || "—";

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Settings" description="Configure your account, integrations, and platform preferences" />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <Card className="p-2 h-fit">
          <ul className="space-y-0.5">
            {visibleSections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setActive(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active === s.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          {active === "profile" && (
            <>
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-1">Profile</h3>
                <p className="text-sm text-slate-500 mb-5">Update your personal information</p>

                {profileMsg && <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 mb-4"><CheckCircle2 className="h-4 w-4 mt-0.5" />{profileMsg}</div>}
                {profileErr && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4"><AlertCircle className="h-4 w-4 mt-0.5" />{profileErr}</div>}

                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-slate-100">
                  <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-xl flex items-center justify-center">{initials}</div>
                  <div>
                    <Button variant="outline" size="sm">Upload photo</Button>
                    <p className="text-xs text-slate-500 mt-2">JPG, PNG, max 2MB</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
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
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-1">Appearance</h3>
              <p className="text-sm text-slate-500 mb-5">Choose how Nxelio looks. &ldquo;System&rdquo; follows your device setting.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                {([
                  { value: "light", label: "Light", icon: <Sun className="h-5 w-5" />, preview: "bg-white border-slate-200" },
                  { value: "dark", label: "Dark", icon: <Moon className="h-5 w-5" />, preview: "bg-slate-900 border-slate-700" },
                  { value: "system", label: "System", icon: <Monitor className="h-5 w-5" />, preview: "bg-gradient-to-br from-white to-slate-900 border-slate-300" },
                ] as { value: Theme; label: string; icon: ReactNode; preview: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => selectTheme(opt.value)}
                    className={`text-left p-4 rounded-xl border-2 transition-colors ${
                      theme === opt.value ? "border-blue-500 bg-blue-50 dark:bg-blue-500/15" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`h-16 w-full rounded-lg border mb-3 ${opt.preview}`} />
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-medium text-slate-900">{opt.icon} {opt.label}</span>
                      {theme === opt.value && <Check className="h-4 w-4 text-blue-600" />}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4">Your choice is saved to this browser and applied instantly.</p>
            </Card>
          )}

          {active === "connectors" && (
            <ConnectorsView
              isSuperAdmin={isSuperAdmin}
              emailSendingActive={emailDomain.verified}
              mailboxAccounts={mailboxAccounts}
              linkedinAccounts={linkedinAccounts}
              connectorReady={unipileConfigured}
              calendarAccounts={calendarAccounts}
              calendarProviderStatus={calendarProviderStatus}
              bookingSlug={bookingSlug}
            />
          )}

          {active === "notifications" && (
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-1">Notification preferences</h3>
              <p className="text-sm text-slate-500 mb-5">Choose what you want to be notified about</p>
              <div className="space-y-3">
                {[
                  { key: "hot", label: "Hot lead alerts", desc: "When a lead score crosses 80" },
                  { key: "completion", label: "Campaign completion", desc: "When a campaign finishes sending" },
                  { key: "replies", label: "New replies in inbox", desc: "Email notification for new replies" },
                  { key: "digest", label: "Weekly performance digest", desc: "Summary every Monday morning" },
                  { key: "errors", label: "Workflow errors", desc: "When an automation fails" },
                  { key: "scoring", label: "AI scoring updates", desc: "When AI re-scores major prospects" },
                ].map((n) => (
                  <label key={n.key} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">{n.label}</p>
                      <p className="text-sm text-slate-500">{n.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotifs({ ...notifs, [n.key]: !notifs[n.key] })}
                      className={`relative h-6 w-11 rounded-full transition-colors ${notifs[n.key] ? "bg-blue-600" : "bg-slate-300"}`}
                    >
                      <span className={`absolute top-0.5 ${notifs[n.key] ? "right-0.5" : "left-0.5"} h-5 w-5 rounded-full bg-white shadow transition`} />
                    </button>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4">Notification preferences are saved to your browser. Server-side persistence coming next.</p>
            </Card>
          )}

          {active === "api" && (
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-1">Integrations</h3>
              <p className="text-sm text-slate-500 mb-3">Connected services — keys are stored as server-only env vars</p>

              <p className="text-sm text-slate-600 leading-relaxed mb-5 bg-slate-50 border border-slate-100 rounded-lg p-3">
                Nxelio connects with these services to power AI, send emails, store data, and sync with your CRM. Keys are stored as server-only env vars and never exposed to the browser. Connect or rotate keys here, or in your hosting platform (Vercel) for production.
              </p>

              <div className="space-y-3">
                {integrations.map((k) => {
                  const notes: Record<string, string> = {
                    "AI Provider (Groq)": "Powers lead scoring, email writing, and prospect insights",
                    "Brevo (Email)": "Sends OTP emails, campaign emails, and notifications",
                    "Supabase": "Database, authentication, and file storage",
                    "HubSpot CRM": "Sync leads and campaigns with your CRM (optional)",
                  };
                  const note = notes[k.name];
                  return (
                    <div key={k.name} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg">{k.emoji}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900">{k.name}</p>
                            {k.configured ? <Badge variant="success"><Check className="h-2.5 w-2.5" /> Connected</Badge> : <Badge variant="default">Not connected</Badge>}
                          </div>
                          <p className="text-xs text-slate-500">{k.description}</p>
                          {note && <p className="text-xs italic text-slate-500 mt-1">{note}</p>}
                          {k.maskedKey && <code className="text-xs text-slate-400 font-mono mt-1 inline-block">{k.maskedKey}</code>}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" disabled><ExternalLink className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2 text-sm text-blue-900">
                <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>To rotate a key, edit <code className="font-mono text-xs bg-white px-1 py-0.5 rounded">.env.local</code> and restart the server. Production keys live in your hosting platform&apos;s env settings.</span>
              </div>
            </Card>
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

          {active === "billing" && (
            <>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-semibold text-slate-900">Current plan</h3>
                    <p className="text-sm text-slate-500">Manage your subscription</p>
                  </div>
                  <Badge variant="purple">Free</Badge>
                </div>
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-6 text-white">
                  <p className="text-sm text-blue-100">Free Plan</p>
                  <p className="text-3xl font-bold mt-1">$0<span className="text-base font-normal text-blue-100">/mo</span></p>
                  <p className="text-sm text-blue-100 mt-2">Up to 1,000 leads · 5,000 AI credits/mo</p>
                  <Button variant="outline" className="mt-4 bg-white">Upgrade to Pro</Button>
                </div>
              </Card>
              <Card className="p-6">
                <h3 className="font-semibold text-slate-900 mb-3">Usage</h3>
                <div className="space-y-3">
                  {[
                    { label: "AI credits used", used: 47, total: 5000 },
                    { label: "Emails sent", used: 3, total: 25000 },
                    { label: "Active leads", used: 10, total: 1000 },
                  ].map((u) => (
                    <div key={u.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700">{u.label}</span>
                        <span className="text-slate-500">{u.used.toLocaleString()} / {u.total.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(u.used / u.total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {active === "security" && (
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-1">Security</h3>
              <p className="text-sm text-slate-500 mb-5">Multi-factor authentication and session management</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
                  <div>
                    <p className="font-semibold text-slate-900">Email OTP verification</p>
                    <p className="text-sm text-slate-500">Available via Supabase Auth (signInWithOtp)</p>
                  </div>
                  <Badge variant="success">Available</Badge>
                </div>
                <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
                  <div>
                    <p className="font-semibold text-slate-900">Authenticator app (TOTP)</p>
                    <p className="text-sm text-slate-500">Use Google Authenticator or Authy</p>
                  </div>
                  <Button variant="outline" disabled>Enable (coming soon)</Button>
                </div>
                <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
                  <div>
                    <p className="font-semibold text-slate-900">Session management</p>
                    <p className="text-sm text-slate-500">Managed by Supabase Auth — log out from any device via topbar</p>
                  </div>
                  <Badge variant="default">Active</Badge>
                </div>
              </div>
            </Card>
          )}

          {active === "audit" && isSuperAdmin && <AuditLogView entries={auditLog} />}
        </div>
      </div>
    </div>
  );
}
