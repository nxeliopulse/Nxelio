-- ============================================================================
-- Outreach — multi-channel (Email + LinkedIn) prospecting sequences
-- Reuses the workspace helpers + auto-fill trigger from 0012_workspaces.sql
-- ============================================================================

-- 1. Sequences — a named, multi-step outreach flow
CREATE TABLE IF NOT EXISTS outreach_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Untitled Sequence',
  description TEXT,
  -- 'email' | 'linkedin' | 'multichannel'
  channel VARCHAR(20) NOT NULL DEFAULT 'multichannel',
  -- 'Draft' | 'Active' | 'Paused'
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  enrolled_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  reply_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Steps — ordered actions within a sequence
CREATE TABLE IF NOT EXISTS outreach_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 1,
  -- 'email' | 'linkedin'
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  -- email: 'email' ; linkedin: 'connection_request' | 'linkedin_message' | 'profile_view'
  action VARCHAR(40) NOT NULL DEFAULT 'email',
  delay_days INT NOT NULL DEFAULT 0,
  subject VARCHAR(255),
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enrollments — which lead is running through which sequence
CREATE TABLE IF NOT EXISTS outreach_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  -- 'active' | 'paused' | 'completed' | 'replied'
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_step INT NOT NULL DEFAULT 0,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sequence_id, lead_id)
);

-- 4. Activities — log of every action taken (sent email, queued LinkedIn action, reply...)
CREATE TABLE IF NOT EXISTS outreach_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  step_id UUID REFERENCES outreach_steps(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  action VARCHAR(40) NOT NULL DEFAULT 'email',
  -- 'sent' | 'queued' | 'failed' | 'replied'
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_steps_seq ON outreach_steps(sequence_id);
CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_seq ON outreach_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_outreach_activities_seq ON outreach_activities(sequence_id);

-- 5. Auto-fill workspace_id on insert (same trigger fn as core tables) + RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'outreach_sequences','outreach_steps','outreach_enrollments','outreach_activities'
  ]) LOOP
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
