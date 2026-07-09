import { getSequenceById, getSequenceSteps } from "@/lib/queries/outreach";
import { OutreachBuilder } from "@/components/outreach/outreach-builder";

export default async function OutreachBuilderPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const sequence = id ? await getSequenceById(id) : null;
  const steps = id ? await getSequenceSteps(id) : [];
  return <OutreachBuilder initialSequence={sequence} initialSteps={steps} />;
}
