import { Suspense } from "react";
import { NewsletterBuilder } from "@/components/newsletters/newsletter-builder";
import { getSegments } from "@/lib/queries/segments";
import { getNewsletterById } from "@/lib/queries/newsletters";
import { emailProvider, emailDomainVerified, emailFromAddress } from "@/lib/email/resend";

/**
 * The builder is reached three ways: blank (no params), from the template
 * gallery (?template=), and "Edit / View" on an existing newsletter (?id=).
 *
 * The ?id= case loads the row HERE, on the server, and hands it to the builder
 * as a prop — the same shape the newsletters list page uses. It previously
 * relied on the client calling getNewsletterById() from an effect after mount,
 * which never populated the form: the builder rendered with its "Untitled
 * newsletter" defaults and, because the loaded row is also what supplies
 * `data.id`, Save then took the create branch and wrote a blank DUPLICATE
 * instead of updating the newsletter being edited.
 *
 * Loading on the server also means no flash of default content before the real
 * values arrive, and a newsletter that cannot be read fails visibly (below)
 * rather than silently looking like a new draft.
 */
export default async function NewsletterBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; template?: string; send?: string }>;
}) {
  const sp = await searchParams;
  const [segments, initial] = await Promise.all([
    getSegments(),
    sp.id ? getNewsletterById(sp.id) : Promise.resolve(null),
  ]);

  // Asked to edit something we cannot read. Saying so beats opening what looks
  // like a blank new draft, which is how this bug silently created duplicates.
  if (sp.id && !initial) {
    return (
      <div className="p-6 text-sm text-slate-500">
        That newsletter could not be loaded. It may have been deleted.
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="text-sm text-slate-500 p-6">Loading...</div>}>
      <NewsletterBuilder
        segments={segments}
        initial={initial}
        email={{ provider: emailProvider, canReachRecipients: emailDomainVerified, from: emailFromAddress }}
      />
    </Suspense>
  );
}
