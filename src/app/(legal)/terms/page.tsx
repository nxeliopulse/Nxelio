import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Terms of Service — LeadPro" };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="June 12, 2026">
      <p>
        These Terms govern your use of LeadPro. By creating an account you agree to them. If you are using
        LeadPro on behalf of an organization, you agree on its behalf.
      </p>

      <h2>1. Your account</h2>
      <p>
        You are responsible for activity under your account and for keeping your credentials secure. The
        first user to sign up for a workspace becomes its Super Admin and may invite additional members and
        manage their access.
      </p>

      <h2>2. Acceptable use</h2>
      <p>
        You agree to use LeadPro only for lawful outreach to contacts you have a legitimate basis to email.
        You will not send unsolicited bulk email, spam, or content that is deceptive, harmful, or violates
        applicable anti-spam laws (such as CAN-SPAM or GDPR). Misuse may result in suspension.
      </p>

      <h2>3. Your content</h2>
      <p>
        You retain ownership of the leads, copy, and other content you put into LeadPro. You grant us the
        limited rights needed to host and process that content to provide the service.
      </p>

      <h2>4. Plans &amp; billing</h2>
      <p>
        Paid plans are billed in advance and are non-refundable except where required by law. We may change
        pricing with notice. Free-tier limits may apply to lead volume, AI credits, and email sending.
      </p>

      <h2>5. Service availability</h2>
      <p>
        We work to keep LeadPro available but provide the service &quot;as is&quot; without warranty of
        uninterrupted operation. We are not liable for indirect or consequential damages to the extent
        permitted by law.
      </p>

      <h2>6. Termination</h2>
      <p>
        You may stop using LeadPro and delete your workspace at any time. We may suspend accounts that violate
        these Terms.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a className="text-blue-600 hover:underline" href="mailto:harirajanncse@gmail.com">harirajanncse@gmail.com</a>.
      </p>
    </LegalShell>
  );
}
