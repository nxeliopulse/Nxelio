-- ============================================================================
-- Epic 5 — Meetings. Stores scheduled/past meetings for the Meetings view:
-- upcoming list, detail panel, edit/reschedule/cancel, past tab with
-- recordings + summaries, and a link to the contact (lead) so history lives in
-- one place. Workspace-scoped via the same helpers as outreach/calendar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NOT NULL,
  location      TEXT,                      -- "Google Meet" / "Webex" / room / address
  join_url      TEXT,                      -- conferencing link (LP-22 join button)
  provider      TEXT,                      -- 'google_meet' | 'teams' | 'webex' | 'manual'
  status        TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | completed | canceled
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,  -- LP-25 linked contact
  attendees     JSONB NOT NULL DEFAULT '[]'::jsonb,            -- [{name,email}]
  recording_url TEXT,                      -- LP-24 past meeting recording
  summary       TEXT,                      -- LP-24 post-meeting summary
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meetings_workspace_start_idx ON meetings(workspace_id, start_at);
CREATE INDEX IF NOT EXISTS meetings_lead_idx ON meetings(lead_id);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON meetings;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON meetings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_meetings ON meetings;
DROP POLICY IF EXISTS ws_insert_meetings ON meetings;
DROP POLICY IF EXISTS ws_update_meetings ON meetings;
DROP POLICY IF EXISTS ws_delete_meetings ON meetings;
CREATE POLICY ws_select_meetings ON meetings FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_meetings ON meetings FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_meetings ON meetings FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_meetings ON meetings FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());
