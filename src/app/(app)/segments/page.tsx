import { getSegments } from "@/lib/queries/segments";
import { SegmentsList } from "@/components/segments/segments-list";

export default async function SegmentsPage() {
  const segments = await getSegments();
  return <SegmentsList segments={segments} />;
}
