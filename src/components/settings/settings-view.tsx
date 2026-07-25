"use client";
import { useState, useTransition, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { User, Ban, Check, Trash2, AlertCircle, CheckCircle2, Palette, Sun, Moon, Monitor, Mail, Calendar, ScrollText } from "lucide-react";
import { Linkedin } from "@/components/outreach/linkedin-icon";
import type { CalendarAccountRow } from "@/lib/queries/calendar-accounts";
import { syncOutreachAccounts, type OutreachAccountRow } from "@/lib/queries/outreach-accounts";
import type { AuditLogRow } from "@/lib/queries/audit-log";
import { EmailConnectorView, LinkedInConnectorView, CalendarConnectorView } from "@/components/settings/connectors-view";
import { AuditLogView } from "@/components/settings/audit-log-view";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { updateProfile, updatePassword } from "@/lib/queries/profile";
import { addBlocklistEntry, removeBlocklistEntry, type BlocklistEntry } from "@/lib/queries/blocklist";
import { getStoredTheme, applyTheme, type Theme } from "@/lib/theme";

const sections = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { id: "linkedin", label: "LinkedIn", icon: <Linkedin className="h-4 w-4" /> },
  { id: "calendar", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
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
  calendarProviderStatus: { google: boolean; microsoft: boolean };
  mailboxAccounts: OutreachAccountRow[];
  linkedinAccounts: OutreachAccountRow[];
  unipileConfigured: boolean;
  bookingSlug?: string | null;
  isSuperAdmin: boolean;
  auditLog: AuditLogRow[];
}

export function SettingsView({ profile, emailDomain, blocklist, calendarAccounts, calendarProviderStatus, mailboxAccounts, linkedinAccounts, unipileConfigured, bookingSlug, isSuperAdmin, auditLog }: Props) {
  const router = useRouter();
  const [active, setActive] = useState("profile");
  const visibleSections = isSuperAdmin ? [...sections, AUDIT_SECTION] : sections;
  // Deep-link support: the calendar OAuth callback redirects back with ?section=calendar,
  // and the mailbox/LinkedIn connect flow uses ?section=email / ?section=linkedin — each
  // is now its own tab id, so no resolution/remapping is needed.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    if (s && visibleSections.some((sec) => sec.id === s)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from a URL param on mount
      setActive(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the Unipile mailbox/LinkedIn connect redirect lands back here
  // (?connected=email|linkedin), pull the newly-authorized account into our DB
  // and refresh — otherwise this page keeps showing "not connected" until a
  // manual reload, even though the connection actually succeeded.
  useEffect(() => {
    const connected = new URLSearchParams(window.location.search).get("connected");
    if (connected !== "email" && connected !== "linkedin") return;
    syncOutreachAccounts().then(() => {
      window.history.replaceState(null, "", `/settings?section=${connected}`);
      router.refresh();
    });
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

          {active === "email" && (
            <EmailConnectorView
              isSuperAdmin={isSuperAdmin}
              emailSendingActive={emailDomain.verified}
              mailboxAccounts={mailboxAccounts}
              connectorReady={unipileConfigured}
            />
          )}

          {active === "linkedin" && (
            <LinkedInConnectorView
              isSuperAdmin={isSuperAdmin}
              linkedinAccounts={linkedinAccounts}
              connectorReady={unipileConfigured}
            />
          )}

          {active === "calendar" && (
            <CalendarConnectorView
              isSuperAdmin={isSuperAdmin}
              calendarAccounts={calendarAccounts}
              calendarProviderStatus={calendarProviderStatus}
              bookingSlug={bookingSlug}
            />
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
