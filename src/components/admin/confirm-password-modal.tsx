"use client";
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Generic "re-enter your password to confirm this sensitive action" modal —
 * no such re-authentication flow existed anywhere in the app before the
 * feature kill switches, but the shape is generic enough to reuse for any
 * future admin-only action that should require the same confirmation.
 */
export function ConfirmPasswordModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (password: string) => Promise<{ ok: boolean; error?: string }>;
  title: string;
  description?: string;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setPassword("");
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!password) { setError("Enter your password."); return; }
    setSubmitting(true);
    setError(null);
    const res = await onConfirm(password);
    setSubmitting(false);
    if (res.ok) {
      setPassword("");
    } else {
      setError(res.error || "Incorrect password.");
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} description={description} size="sm">
      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Your password</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
            autoFocus
            placeholder="Password"
            disabled={submitting}
          />
        </div>
      </div>
      <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
        <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button onClick={handleConfirm} disabled={submitting}>
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</> : "Confirm"}
        </Button>
      </div>
    </Modal>
  );
}
