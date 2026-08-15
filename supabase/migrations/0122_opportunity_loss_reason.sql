-- ============================================================================
-- Pipeline & Opportunities Analytics — loss reason tracking.
--
-- Nullable/additive: existing lost deals simply have no reason until the
-- Opportunities board is updated to prompt for one on the "Mark Lost"
-- action (a separate, non-analytics UI change). The column exists now so
-- Win/Loss Analysis has somewhere real to read from once that's wired up,
-- rather than analytics inventing data that was never captured.
-- ============================================================================

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS loss_reason TEXT
  CHECK (loss_reason IS NULL OR loss_reason IN ('Price', 'Competitor', 'No Budget', 'No Decision', 'Timing', 'Poor Fit', 'Lost Contact', 'Other'));
