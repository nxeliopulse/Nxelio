import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingPage, type LandingPageNotice } from "@/components/landing/landing-page";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ just_signed_up?: string; verified?: string; email?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const sp = await searchParams;
  const notice: LandingPageNotice | null =
    sp.just_signed_up === "1" ? { kind: "signed_up", email: sp.email }
    : sp.verified === "1" ? { kind: "verified", email: sp.email }
    : null;

  return <LandingPage notice={notice} />;
}
