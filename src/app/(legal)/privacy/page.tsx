import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Privacy Policy — LeadPro" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="June 12, 2026">
      <p>
        This Privacy Policy explains how LeadPro (&quot;we&quot;, &quot;us&quot;) collects, uses, and protects
        information when you use our lead-nurturing platform. We designed LeadPro to be multi-tenant: your
        data is isolated to your workspace and is never shared with other customers.
      </p>

      <h2>1. Information we collect</h2>
      <p>
        We collect the account details you provide (name, email, password), the lead and campaign data you
        import or capture, and basic usage telemetry needed to operate the service. Lead records you upload
        remain your data and are stored against your workspace only.
      </p>

      <h2>2. How we use information</h2>
      <p>
        We use your information to authenticate you, deliver the features you request (lead scoring, email
        sending, analytics), and keep the service secure. We do not sell your data. AI processing (for lead
        scoring and content generation) is performed per-request and is not used to train shared models.
      </p>

      <h2>3. Email &amp; communications</h2>
      <p>
        When you send campaigns or newsletters through LeadPro, outbound email is delivered via our email
        provider on your behalf. Recipients can unsubscribe at any time, and unsubscribed addresses are added
        to your workspace blocklist.
      </p>

      <h2>4. Data retention &amp; deletion</h2>
      <p>
        Your data is retained for as long as your workspace is active. You may delete leads, campaigns, and
        your account at any time. Deleting your workspace removes the associated records.
      </p>

      <h2>5. Security</h2>
      <p>
        Data is encrypted in transit. Access is governed by row-level security so that each request can only
        reach data within the authenticated user&apos;s workspace. Passwords are stored using industry-standard
        hashing and are never visible to us.
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions about this policy? Email{" "}
        <a className="text-blue-600 hover:underline" href="mailto:harirajanncse@gmail.com">harirajanncse@gmail.com</a>.
      </p>
    </LegalShell>
  );
}
