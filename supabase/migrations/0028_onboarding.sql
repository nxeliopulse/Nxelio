-- ============================================================================
-- Onboarding — company & sales "essentials" captured right after signup.
-- Stored on the workspace (one setup per team). `onboarding_completed` gates
-- access to the app until the wizard is finished.
-- workspaces already has RLS (owner can update); no new policies needed.
-- ============================================================================

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding JSONB DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
