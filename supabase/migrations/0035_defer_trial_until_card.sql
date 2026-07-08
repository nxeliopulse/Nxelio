-- ============================================================================
-- Card-first, then trial: a brand-new workspace should have NO subscription
-- row until a payment method has actually been added (via Chargebee checkout).
-- Previously, on_workspace_created_subscription auto-granted a 7-day Basic
-- trial with 150 credits the instant a workspace was created — no card
-- required. That's being replaced by a dashboard-level gate (in the app) that
-- routes an unsubscribed user into Chargebee checkout, whose Basic Monthly
-- item price already has its own native 7-day trial configured — so
-- completing that checkout is what starts the trial now, not signup.
--
-- getSubscription() already returns null gracefully when no row exists, so
-- no application code depends on a subscription row always being present.
-- ============================================================================

DROP TRIGGER IF EXISTS on_workspace_created_subscription ON workspaces;
DROP FUNCTION IF EXISTS create_workspace_subscription();
