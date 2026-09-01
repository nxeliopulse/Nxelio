"use client";

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIndicator,
  AlertTitle,
} from "@/components/tailgrids/core/alert";

/** Reference sheet for the five Alert statuses, written with the messages
 *  Nxelio actually shows — mailbox connection, credits, trial expiry — so the
 *  wording can be reviewed alongside the styling instead of in the abstract. */
export default function AlertVariantsPreview() {
  return (
    <div className="flex flex-col gap-6 w-full">
      <Alert>
        <AlertIndicator />
        <AlertContent>
          <AlertTitle>Default</AlertTitle>
          <AlertDescription>
            Your workspace is set to UTC. Meeting times are shown in your local
            timezone.
          </AlertDescription>
        </AlertContent>
      </Alert>

      <Alert status="success">
        <AlertIndicator />
        <AlertContent>
          <AlertTitle>Leads imported</AlertTitle>
          <AlertDescription>
            248 leads were added to your workspace. AI scoring is running now.
          </AlertDescription>
        </AlertContent>
      </Alert>

      <Alert status="warning">
        <AlertIndicator />
        <AlertContent>
          <AlertTitle>Trial ending soon</AlertTitle>
          <AlertDescription>
            Your free trial ends in 3 days. Add a payment method to keep your
            campaigns running.
          </AlertDescription>
        </AlertContent>
      </Alert>

      <Alert status="error">
        <AlertIndicator />
        <AlertContent>
          <AlertTitle>Mailbox disconnected</AlertTitle>
          <AlertDescription>
            We couldn&apos;t send from your inbox. Reconnect it in Settings to
            resume outreach.
          </AlertDescription>
        </AlertContent>
      </Alert>

      <Alert status="info">
        <AlertIndicator />
        <AlertContent>
          <AlertTitle>Credits running low</AlertTitle>
          <AlertDescription>
            You have 42 AI credits left this cycle. They reset on the 8th.
          </AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}
