import type { ReactNode } from "react";
import { AuthSplitCard } from "@/components/auth/auth-split-card";

// This used to be a second, hand-maintained copy of the login/signup shell —
// same dark-panel design now lives once in AuthSplitCard. Duplicating it
// let the two drift (this copy still had a fabricated "James Wilson ·
// PeakVenture" testimonial with a fake 5-star rating and an invented "80%
// bounce rate / 40+ meetings" stat long after the real one was cleaned up).
// One shared component means that can't happen again.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthSplitCard>{children}</AuthSplitCard>;
}
