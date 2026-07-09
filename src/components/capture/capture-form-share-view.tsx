"use client";
import { useState } from "react";
import { Copy, ExternalLink, Check, Eye, Sparkles, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";

interface WorkspaceInfo {
  id: string;
  name: string;
  capture_slug: string;
}

interface Props {
  workspace: WorkspaceInfo | null;
  origin: string;
}

export function CaptureFormShareView({ workspace, origin }: Props) {
  const [copied, setCopied] = useState<"url" | "embed" | null>(null);

  if (!workspace) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader title="Capture Form" description="Share your lead capture URL" />
        <Card className="p-8 text-center text-slate-500">
          Your workspace is being set up. Please refresh in a moment.
        </Card>
      </div>
    );
  }

  const captureUrl = `${origin}/capture/${workspace.capture_slug}`;
  const embedSnippet = `<iframe src="${captureUrl}" width="100%" height="800" frameborder="0" style="border:0;border-radius:16px"></iframe>`;

  async function copy(value: string, kind: "url" | "embed") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title="Capture Form"
        description="Your private lead capture URL — submissions land directly in your workspace."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        {/* Left: settings */}
        <div className="space-y-4">
          <Card className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-blue-700">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Workspace: {workspace.name}</h3>
                <p className="text-sm text-blue-100 mt-0.5">Any lead submitted on this URL will only be visible in this workspace.</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-1">Public capture URL</h3>
            <p className="text-sm text-slate-500 mb-4">Share this anywhere — website, email signature, social bio. Submissions land in your inbox.</p>

            <div className="flex flex-col sm:flex-row items-stretch gap-2">
              <Input value={captureUrl} readOnly className="font-mono text-sm" />
              <Button onClick={() => copy(captureUrl, "url")} className="flex-shrink-0">
                {copied === "url" ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy</>}
              </Button>
              <a href={captureUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full sm:w-auto">
                  <ExternalLink className="h-4 w-4" /> Open
                </Button>
              </a>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
              Embed on your website
              <Badge variant="default">HTML</Badge>
            </h3>
            <p className="text-sm text-slate-500 mb-4">Paste this snippet on any page to embed the capture form as an iframe.</p>

            <div className="rounded-lg bg-slate-900 text-slate-100 p-4 font-mono text-xs overflow-x-auto">
              <code>{embedSnippet}</code>
            </div>

            <div className="mt-3 flex justify-end">
              <Button variant="outline" onClick={() => copy(embedSnippet, "embed")}>
                {copied === "embed" ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy embed</>}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-slate-400" /> Share via
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <a
                href={`mailto:?subject=Share%20your%20info&body=${encodeURIComponent(`Please share your details: ${captureUrl}`)}`}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700"
              >
                <span className="text-lg">📧</span> Email
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Share your details: ${captureUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700"
              >
                <span className="text-lg">💬</span> WhatsApp
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Get in touch — fill our short form: ${captureUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700"
              >
                <span className="text-lg">🐦</span> Twitter
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(captureUrl)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700"
              >
                <span className="text-lg">in</span> LinkedIn
              </a>
            </div>
          </Card>
        </div>

        {/* Right: preview */}
        <div>
          <Card className="p-4 sticky top-20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Eye className="h-4 w-4 text-slate-400" /> Live preview
              </h3>
              <Badge variant="success">Live</Badge>
            </div>
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100" style={{ height: 560 }}>
              <iframe
                src={captureUrl}
                className="w-full h-full"
                style={{ transform: "scale(0.7)", transformOrigin: "top left", width: "143%", height: "143%" }}
                title="Capture form preview"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">Submissions made on this URL go directly to your workspace.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
