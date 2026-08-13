"use client";
import { useEffect, useState } from "react";
import { isFeatureEnabledForCurrentUser } from "@/lib/queries/feature-kill-switches";
import type { KillSwitchFeature } from "@/lib/kill-switch-rules";

/**
 * Whether the current user can use a platform-wide-switchable feature
 * (Launch Campaign / Send Email / Send Newsletter) right now — the platform
 * admin (admin@nxelio.com) always gets true, even while it's off for
 * everyone else. Defaults to enabled=true while loading so a button doesn't
 * flash locked-then-unlocked on every page load; the real server-side check
 * in the action itself is what actually blocks a bypass attempt either way.
 */
export function useFeatureKillSwitch(feature: KillSwitchFeature): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    isFeatureEnabledForCurrentUser(feature)
      .then((v) => { if (!cancelled) setEnabled(v); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [feature]);

  return { enabled, loading };
}
