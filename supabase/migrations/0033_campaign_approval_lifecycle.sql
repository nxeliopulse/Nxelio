-- ============================================================================
-- Content approval lifecycle for campaigns — a second, independent status
-- track alongside the existing operational `status` (Draft/Active/Paused/
-- Scheduled). `approval_status` gates whether a campaign may be launched at
-- all: Draft (AI-generated) -> Pending review -> Approved -> Live/Distributing
-- -> Archived. campaign_approval_log is an append-only audit trail of every
-- transition (who, when, optional comment).
-- ============================================================================

-- New workspace role: the only role (besides Super Admin) allowed to approve
-- or send back a Pending review campaign.
INSERT INTO roles (role_name, role_description)
SELECT 'Reviewer', 'Can approve or send back AI-generated campaign content before it goes live.'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Reviewer');

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'Draft (AI-generated)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_approval_status_check'
  ) THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_approval_status_check
      CHECK (approval_status IN ('Draft (AI-generated)', 'Pending review', 'Approved', 'Live/Distributing', 'Archived'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS campaign_approval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  changed_by UUID REFERENCES users(user_id), -- NULL = System (e.g. auto-archive)
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_approval_log_campaign ON campaign_approval_log(campaign_id, created_at);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['campaign_approval_log']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_select_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert_%s ON %I;', t, t);
    EXECUTE format('CREATE POLICY ws_select_%s ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_insert_%s ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());', t, t);
  END LOOP;
END $$;
