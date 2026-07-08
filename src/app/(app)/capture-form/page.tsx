import { getCurrentWorkspace } from "@/lib/queries/workspaces";
import { CaptureFormShareView } from "@/components/capture/capture-form-share-view";
import { headers } from "next/headers";

export default async function CaptureFormPage() {
  const ws = await getCurrentWorkspace();
  const hdrs = await headers();
  const host = hdrs.get("host") || "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") || "http";
  const origin = `${proto}://${host}`;
  return <CaptureFormShareView workspace={ws} origin={origin} />;
}
