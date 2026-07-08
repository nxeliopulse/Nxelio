-- ============================================================================
-- Opportunities — the "to-Revenue" half of the Lead-to-Revenue flow.
-- A lead is converted into an opportunity, which then moves through a sales
-- pipeline (new → qualified → meeting_scheduled → proposal_sent → negotiation
-- → won / lost) and carries a deal value used for revenue reporting.
-- Reuses the workspace helpers + auto-fill trigger from 0012_workspaces.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  -- Denormalized snapshot of the lead at convert time (survives lead deletion)
  name VARCHAR(200) NOT NULL DEFAULT 'Untitled deal',
  company VARCHAR(200),
  contact_name VARCHAR(150),
  contact_email VARCHAR(255),
  deal_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- 'new' | 'qualified' | 'meeting_scheduled' | 'proposal_sent' | 'negotiation' | 'won' | 'lost'
  stage VARCHAR(30) NOT NULL DEFAULT 'new',
  expected_close_date DATE,
  notes TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Set automatically when stage moves to a closed state, for cycle-time reporting
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_workspace ON opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead ON opportunities(lead_id);

-- Auto-fill workspace_id on insert (same trigger fn as core tables) + RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['opportunities']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_select_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_update_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_delete_%s ON %I;', t, t);
    EXECUTE format('CREATE POLICY ws_select_%s ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_insert_%s ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_update_%s ON %I FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_delete_%s ON %I FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
  END LOOP;
END $$;
