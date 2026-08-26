-- One-time backfill for a bug where enrollment eligibility always assumed the
-- "email" channel, wrongly failing LinkedIn-only leads on LinkedIn/multichannel
-- campaigns (fixed in code by detectCampaignChannel + eligibility-core.ts).
-- Flips affected "failed" enrollments back to "active" and moves those leads
-- to "Nurturing" (mirrors 0145's backfill), since they can now actually be
-- reached by the campaign they were added to.
WITH fixable AS (
  SELECT ce.id AS enrollment_id, ce.lead_id
  FROM campaign_enrollments ce
  JOIN campaigns c ON c.id = ce.campaign_id
  JOIN leads l ON l.id = ce.lead_id
  WHERE ce.status = 'failed'
    AND c.content ~* '\[li:(connection_request|linkedin_message|message)\]'
    AND l.linkedin IS NOT NULL AND l.linkedin <> ''
)
UPDATE campaign_enrollments ce
SET status = 'active', exit_reason = NULL
FROM fixable
WHERE ce.id = fixable.enrollment_id;

UPDATE leads l
SET status = 'Nurturing'
FROM campaign_enrollments ce
JOIN campaigns c ON c.id = ce.campaign_id
WHERE ce.lead_id = l.id
  AND ce.status = 'active'
  AND l.status NOT IN ('Nurturing', 'Converted')
  AND c.content ~* '\[li:(connection_request|linkedin_message|message)\]';
