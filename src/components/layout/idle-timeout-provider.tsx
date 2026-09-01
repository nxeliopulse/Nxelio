"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { pingActivity } from "@/lib/auth/activity";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
// Don't hit the server on every single mousemove — once a minute is plenty
// to keep the server-side idle cookie (src/proxy.ts) sliding forward.
const HEARTBEAT_MIN_INTERVAL_MS = 60_000;
// How often we re-check elapsed time locally. Wall-clock based (Date.now()
// deltas, not a tick counter), so a backgrounded/throttled tab can't drift —
// whenever this next fires, the elapsed-time math is still accurate.
const CHECK_INTERVAL_MS = 1_000;

export function IdleTimeoutProvider({
  idleTimeoutMinutes,
  warningLeadMinutes,
  children,
}: {
  idleTimeoutMinutes: number;
  warningLeadMinutes: number;
  children: React.ReactNode;
}) {
  // eslint-disable-next-line react-hooks/purity -- needs the real mount time to start the idle clock; deferring this to an effect risks the idle-check interval below racing ahead of it and firing an immediate false logout
  const lastActivityRef = useRef(Date.now());
  const lastHeartbeatRef = useRef(0);
  const loggingOutRef = useRef(false);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const idleLimitMs = idleTimeoutMinutes * 60_000;
  const warningLeadMs = Math.min(warningLeadMinutes, idleTimeoutMinutes) * 60_000;
  const warnAtMs = idleLimitMs - warningLeadMs;

  const forceLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    const supabase = createClient();
    // Same shape as the manual logout in topbar.tsx: revoke server-side when
    // we can, but cap the wait so an unreachable auth server can't strand
    // someone on an idle-expired page. The local pass is storage-only.
    try {
      const timedOut = await Promise.race([
        supabase.auth.signOut().then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 2000)),
      ]);
      if (timedOut) await supabase.auth.signOut({ scope: "local" });
    } catch {
      // proceed to redirect regardless — the server-side idle check in
      // proxy.ts will reject stale requests either way
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }
    // Hard replace rather than router.push: avoids a second RSC round-trip
    // through proxy.ts and drops all logged-in client state.
    window.location.replace("/login?reason=idle");
  }, []);

  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning((w) => (w ? false : w));
    const now = Date.now();
    if (now - lastHeartbeatRef.current > HEARTBEAT_MIN_INTERVAL_MS) {
      lastHeartbeatRef.current = now;
      pingActivity().catch(() => {});
    }
  }, []);

  useEffect(() => {
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, handleActivity, { passive: true });
    return () => {
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, handleActivity);
    };
  }, [handleActivity]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleLimitMs) {
        forceLogout();
        return;
      }
      if (elapsed >= warnAtMs) {
        setShowWarning(true);
        setSecondsLeft(Math.max(0, Math.round((idleLimitMs - elapsed) / 1000)));
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [idleLimitMs, warnAtMs, forceLogout]);

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <>
      {children}
      <Modal open={showWarning} onClose={handleActivity} title="Still there?" size="sm">
        <div className="p-5">
          <p className="text-sm text-slate-600">
            You&apos;ve been inactive for a while. For your security, you&apos;ll be signed out in{" "}
            <span className="font-bold text-slate-900">{mm}:{ss}</span> unless you stay active.
          </p>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={forceLogout}>Log out now</Button>
          <Button onClick={handleActivity}>Stay signed in</Button>
        </div>
      </Modal>
    </>
  );
}
