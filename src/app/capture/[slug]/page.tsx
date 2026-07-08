import { notFound } from "next/navigation";
import { CaptureForm } from "@/components/capture/capture-form";
import { getCaptureWorkspaceInfo } from "@/lib/queries/capture";

export default async function CaptureBySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const info = await getCaptureWorkspaceInfo(slug);
  if (!info.exists) notFound();
  return <CaptureForm workspaceSlug={slug} workspaceName={info.name} />;
}
