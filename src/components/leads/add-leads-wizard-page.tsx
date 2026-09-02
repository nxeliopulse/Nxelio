"use client";
import { useRouter } from "next/navigation";
import { AddLeadsWizard } from "@/components/leads/add-leads-wizard";

/** Thin client wrapper so /leads/add can stay a server component page while
 *  still wiring the wizard's onClose to a real navigation back to /leads. */
export function AddLeadsWizardPage() {
  const router = useRouter();
  return <AddLeadsWizard open onClose={() => router.push("/leads")} asPage />;
}
