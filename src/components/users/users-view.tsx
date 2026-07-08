"use client";
import { useState, useEffect, useTransition } from "react";
import { Search, Plus, Shield, ShieldCheck, User, AlertCircle, CheckCircle2, Copy, Check, KeyRound, Trash2, Calendar, Mail, RefreshCw, Lock } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { useFeedback } from "@/components/ui/feedback";
import { inviteUser, deleteUser, resetUserPassword, getUserAuthInfo, updateUserNavAccess, type UserWithRole } from "@/lib/queries/users";
import { navMainItems, navAdminItems } from "@/lib/nav-config";
import { formatDate, formatDateTime } from "@/lib/utils";

interface Props {
  users: UserWithRole[];
  roles: { role_id: number; role_name: string; role_description?: string | null }[];
  isAdmin: boolean;
  currentUserId: string | null;
}

const roleIcon: Record<string, React.ReactNode> = {
  "Super Admin": <ShieldCheck className="h-3 w-3" />,
  "Marketing Admin": <Shield className="h-3 w-3" />,
  "Sales Admin": <User className="h-3 w-3" />,
};
const roleVariant: Record<string, "purple" | "pink" | "blue" | "default"> = {
  "Super Admin": "purple",
  "Marketing Admin": "pink",
  "Sales Admin": "blue",
};

const roleAccessSummary: Record<string, string[]> = {
  "Super Admin": ["All workspace screens", "User Management", "Capture Form", "Billing & Integrations"],
  "Sales Admin": ["Dashboard", "Leads", "Campaigns", "Inbox", "Workflows", "Analytics", "Templates"],
  "Marketing Admin": ["Dashboard", "Segments", "Newsletters", "Workflows", "Analytics", "Templates"],
};

export function UsersView({ users, roles, isAdmin, currentUserId }: Props) {
  const visibleUsers = isAdmin ? users : users.filter((u) => u.user_id === currentUserId);
  const { toast, confirm } = useFeedback();
  const [pending, start] = useTransition();
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", roleId: roles.find((r) => r.role_name === "Sales Admin")?.role_id ?? 3 });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [detailUser, setDetailUser] = useState<UserWithRole | null>(null);
  const [authInfo, setAuthInfo] = useState<{ last_sign_in_at: string | null; email_confirmed_at: string | null } | null>(null);
  const [resetPw, setResetPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [navAccess, setNavAccess] = useState<Record<string, boolean>>({});
  const [savedNavAccess, setSavedNavAccess] = useState<Record<string, boolean>>({});
  const [permsMsg, setPermsMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!detailUser) {
      setAuthInfo(null);
      setResetPw(null);
      setNavAccess({});
      setSavedNavAccess({});
      setPermsMsg(null);
      return;
    }
    getUserAuthInfo(detailUser.user_id).then(setAuthInfo).catch(() => setAuthInfo(null));
    const initial = (detailUser.nav_access || {}) as Record<string, boolean>;
    setNavAccess({ ...initial });
    setSavedNavAccess({ ...initial });
  }, [detailUser]);

  const filtered = visibleUsers.filter((u) => !search || u.full_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()));

  async function handleInvite() {
    setError(null); setSuccess(null);
    if (!form.fullName || !form.email) { setError("Name and email required"); return; }
    start(async () => {
      try {
        const result = await inviteUser(form.email, form.fullName, form.roleId, null);
        setSuccess(`User created. Temp password: ${result.tempPassword}`);
        const defaultRole = roles.find((r) => r.role_name === "Sales Admin")?.role_id ?? 3;
        setForm({ fullName: "", email: "", roleId: defaultRole });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  async function handleDelete(userId: string) {
    if (!(await confirm({ title: "Delete user?", message: "Delete this user permanently?", confirmLabel: "Delete", danger: true }))) return;
    start(async () => { await deleteUser(userId); setDetailUser(null); });
  }

  async function handleReset() {
    if (!detailUser) return;
    if (!(await confirm({ title: "Reset password?", message: "Generate a new temporary password for this user? Their old password will stop working immediately.", confirmLabel: "Generate" }))) return;
    start(async () => {
      try {
        const r = await resetUserPassword(detailUser.user_id);
        setResetPw(r.tempPassword);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Reset failed", "error");
      }
    });
  }

  async function copyPw() {
    if (!resetPw) return;
    try { await navigator.clipboard.writeText(resetPw); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  function togglePerm(href: string, allowed: boolean) {
    setNavAccess((prev) => ({ ...prev, [href]: allowed }));
    setPermsMsg(null);
  }

  function clearPerm(href: string) {
    setNavAccess((prev) => {
      const next = { ...prev };
      delete next[href];
      return next;
    });
    setPermsMsg(null);
  }

  async function handleSavePerms() {
    if (!detailUser) return;
    start(async () => {
      try {
        await updateUserNavAccess(detailUser.user_id, navAccess);
        setSavedNavAccess({ ...navAccess });
        setPermsMsg("Permissions saved. Changes apply on the user's next page load.");
      } catch (err) {
        setPermsMsg(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  const permsDirty = JSON.stringify(navAccess) !== JSON.stringify(savedNavAccess);

  const adminCount = visibleUsers.filter((u) => u.role_name === "Super Admin").length;
  const marketingCount = visibleUsers.filter((u) => u.role_name === "Marketing Admin").length;
  const salesCount = visibleUsers.filter((u) => u.role_name === "Sales Admin").length;

  const selectedRole = roles.find((r) => r.role_id === form.roleId);
  const accessList = selectedRole ? roleAccessSummary[selectedRole.role_name] || [] : [];

  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="User Management"
        description="Click any user to view details or reset their password."
        actions={isAdmin ? <Button onClick={() => { setShowInvite(true); setError(null); setSuccess(null); }}><Plus className="h-4 w-4" /> Create User</Button> : null}
      />

      {!isAdmin && (
        <div className="mb-6 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>You don&apos;t have permission to manage users. Please ask a Super Admin.</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { role: "Super Admin", count: adminCount, color: "bg-purple-50 text-purple-600" },
          { role: "Marketing Admin", count: marketingCount, color: "bg-pink-50 text-pink-600" },
          { role: "Sales Admin", count: salesCount, color: "bg-blue-50 text-blue-600" },
        ].map((r) => (
          <Card key={r.role} className="p-5 flex items-center gap-4">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${r.color}`}>{roleIcon[r.role]}</div>
            <div>
              <p className="text-sm text-slate-500">{r.role}s</p>
              <p className="text-2xl font-bold text-slate-900">{r.count}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px] max-w-md">
            <Input leftIcon={<Search className="h-4 w-4" />} placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-16 text-center text-slate-500">No users found.</td></tr>
              )}
              {filtered.map((u) => (
                <tr key={u.user_id} onClick={() => isAdmin && setDetailUser(u)} className={`hover:bg-slate-50 ${isAdmin ? "cursor-pointer" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-semibold flex items-center justify-center">
                        {(u.full_name || "").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.full_name || "—"}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={roleVariant[u.role_name] || "default"}>
                      {roleIcon[u.role_name] || null} {u.role_name}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${u.status === "ACTIVE" ? "text-emerald-700" : "text-slate-500"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-300"}`} />
                      {u.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.created_at ? formatDate(u.created_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create User Modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Create new user" description="They'll be invited to this workspace with the selected role">
        <div className="p-5 space-y-4">
          {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{error}</span></div>}
          {success && <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{success}</span></div>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name *</label>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="John Smith" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@leadpro.ai" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Role *</label>
            <Select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: Number(e.target.value) })}>
              {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
            </Select>
            {selectedRole?.role_description && <p className="text-xs text-slate-500 mt-2">{selectedRole.role_description}</p>}
          </div>
          {accessList.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
              <p className="font-semibold text-blue-900 mb-1">This role can access:</p>
              <ul className="list-disc list-inside text-blue-800 space-y-0.5">
                {accessList.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowInvite(false)} disabled={pending}>Close</Button>
          <Button onClick={handleInvite} disabled={pending}>{pending ? "Creating..." : "Create user"}</Button>
        </div>
      </Modal>

      {/* User Detail Modal */}
      <Modal open={detailUser !== null} onClose={() => setDetailUser(null)} title="User details" description={detailUser?.email || ""} size="md">
        {detailUser && (
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-lg flex items-center justify-center">
                {(detailUser.full_name || "").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">{detailUser.full_name || "—"}</p>
                <Badge variant={roleVariant[detailUser.role_name] || "default"}>{roleIcon[detailUser.role_name] || null} {detailUser.role_name}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><Mail className="h-3.5 w-3.5" /> Email</div>
                <p className="font-medium text-slate-900 break-all">{detailUser.email}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">Status</div>
                <p className="font-medium text-slate-900">{detailUser.status === "ACTIVE" ? "Active" : "Inactive"}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><Calendar className="h-3.5 w-3.5" /> Created</div>
                <p className="font-medium text-slate-900">{detailUser.created_at ? formatDateTime(detailUser.created_at) : "—"}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1"><Calendar className="h-3.5 w-3.5" /> Last sign-in</div>
                <p className="font-medium text-slate-900">{authInfo?.last_sign_in_at ? formatDateTime(authInfo.last_sign_in_at) : "Never"}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 sm:col-span-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">Email confirmed</div>
                <p className="font-medium text-slate-900">{authInfo?.email_confirmed_at ? `Yes — ${formatDate(authInfo.email_confirmed_at)}` : "Pending"}</p>
              </div>
            </div>

            {/* Password section */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <KeyRound className="h-4 w-4 mt-0.5 text-amber-700 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900 mb-1">Password</p>
                  <p className="text-xs text-amber-800">
                    Existing passwords are encrypted and cannot be viewed. You can generate a new temporary password to share with the user.
                  </p>
                </div>
              </div>

              {resetPw ? (
                <div className="mt-3 flex items-stretch gap-2">
                  <Input value={resetPw} readOnly className="font-mono text-sm bg-white" />
                  <Button variant="outline" onClick={copyPw}>
                    {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                  </Button>
                </div>
              ) : (
                <Button onClick={handleReset} disabled={pending} className="mt-3" variant="outline">
                  {pending ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating...</> : <><KeyRound className="h-4 w-4" /> Reset & generate new password</>}
                </Button>
              )}
            </div>

            {/* Permissions section — Super Admin only */}
            {isAdmin && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-3">
                  <Lock className="h-4 w-4 mt-0.5 text-blue-700 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-1">Tab access</p>
                    <p className="text-xs text-blue-800">
                      Override which tabs this user can access. Leave on <strong>Role default</strong> to follow the role&apos;s normal permissions, or explicitly <strong>Allow</strong> / <strong>Deny</strong> a specific tab.
                    </p>
                  </div>
                </div>

                <PermsGroup
                  title="Workspace"
                  items={navMainItems}
                  navAccess={navAccess}
                  userRole={detailUser.role_name}
                  onToggle={togglePerm}
                  onClear={clearPerm}
                />
                <PermsGroup
                  title="Admin"
                  items={navAdminItems}
                  navAccess={navAccess}
                  userRole={detailUser.role_name}
                  onToggle={togglePerm}
                  onClear={clearPerm}
                />

                {permsMsg && (
                  <div className="mt-3 text-xs text-blue-900 bg-white border border-blue-200 rounded-md px-3 py-2">{permsMsg}</div>
                )}

                <div className="mt-3 flex items-center justify-end gap-2">
                  {permsDirty && (
                    <Button variant="outline" onClick={() => setNavAccess({ ...savedNavAccess })} disabled={pending}>
                      Revert
                    </Button>
                  )}
                  <Button onClick={handleSavePerms} disabled={pending || !permsDirty}>
                    {pending ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving...</> : <>Save permissions</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="p-5 border-t border-slate-100 flex justify-between items-center">
          {detailUser && detailUser.user_id !== currentUserId ? (
            <Button variant="danger" onClick={() => handleDelete(detailUser.user_id)} disabled={pending}>
              <Trash2 className="h-4 w-4" /> Delete user
            </Button>
          ) : <span />}
          <Button variant="outline" onClick={() => setDetailUser(null)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

type NavItemLite = { label: string; href: string; roles: string[] };

function PermsGroup({
  title,
  items,
  navAccess,
  userRole,
  onToggle,
  onClear,
}: {
  title: string;
  items: NavItemLite[];
  navAccess: Record<string, boolean>;
  userRole: string;
  onToggle: (href: string, allowed: boolean) => void;
  onClear: (href: string) => void;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-900/70 mb-1.5">{title}</p>
      <div className="bg-white rounded-md border border-blue-100 divide-y divide-blue-50">
        {items.map((item) => {
          const hasOverride = Object.prototype.hasOwnProperty.call(navAccess, item.href);
          const override = hasOverride ? navAccess[item.href] : undefined;
          const roleDefault = item.roles.includes(userRole);
          const current: "default" | "allow" | "deny" =
            override === true ? "allow" : override === false ? "deny" : "default";
          const effective = current === "allow" ? true : current === "deny" ? false : roleDefault;
          return (
            <div key={item.href} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{item.label}</p>
                <p className="text-[11px] text-slate-500">
                  Role default: <span className={roleDefault ? "text-emerald-700" : "text-slate-500"}>{roleDefault ? "Allowed" : "Denied"}</span>
                  {" · "}
                  Effective: <span className={effective ? "text-emerald-700" : "text-rose-700"}>{effective ? "Allowed" : "Denied"}</span>
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => onClear(item.href)}
                  className={
                    "px-2 py-1 rounded-md border transition-colors " +
                    (current === "default"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                  }
                >
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(item.href, true)}
                  className={
                    "px-2 py-1 rounded-md border transition-colors " +
                    (current === "allow"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                  }
                >
                  Allow
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(item.href, false)}
                  className={
                    "px-2 py-1 rounded-md border transition-colors " +
                    (current === "deny"
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                  }
                >
                  Deny
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
