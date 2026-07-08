-- ============================================================================
-- Connected accounts belong to ONE workspace.
--
-- There is a single shared Unipile API key for the whole app, so a naive sync
-- copied every connected account into every workspace that clicked "Recheck".
-- Fix: dedup leaked copies (keep the most-recent per account_id) and enforce a
-- GLOBAL unique constraint on account_id, so a workspace can never claim an
-- account already owned by another workspace.
-- ============================================================================

DELETE FROM outreach_accounts
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY account_id ORDER BY created_at DESC, id DESC) AS rn
    FROM outreach_accounts
    WHERE account_id IS NOT NULL
  ) t WHERE rn > 1
);

ALTER TABLE outreach_accounts DROP CONSTRAINT IF EXISTS outreach_accounts_account_id_key;
ALTER TABLE outreach_accounts ADD CONSTRAINT outreach_accounts_account_id_key UNIQUE (account_id);
