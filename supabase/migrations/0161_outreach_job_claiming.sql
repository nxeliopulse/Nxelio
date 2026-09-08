-- ============================================================================
-- Outreach queue: make job pickup safe across multiple app instances.
--
-- processDueJobs() used to SELECT status='pending' rows and only mark them
-- 'sent' AFTER the send completed. With one instance that is fine. Behind a
-- load balancer every replica reads the same pending rows in the same tick
-- and sends the same message to the same prospect N times.
--
-- Fix: a 'processing' status claimed by a conditional UPDATE (see
-- claimDueJobs in src/lib/outreach/claim.ts). claimed_at lets a job that
-- was interrupted mid-send — a pod evicted during a load test, say — be
-- reclaimed instead of being stranded in 'processing' forever.
-- ============================================================================

ALTER TABLE outreach_jobs   ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE campaign_jobs   ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- The claim query filters on (status, run_at); without this it degrades into a
-- full scan on every cron tick once the queue grows.
CREATE INDEX IF NOT EXISTS idx_outreach_jobs_claim
  ON outreach_jobs (status, run_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_claim
  ON campaign_jobs (status, run_at)
  WHERE status IN ('pending', 'processing');
