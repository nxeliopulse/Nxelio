-- AI Builder prompt history — lets a user reuse/regenerate from a recent
-- prompt instead of retyping it. Scoped per-user (not per-workspace) since
-- prompt history is a personal convenience, not shared team data.
CREATE TABLE IF NOT EXISTS ai_segment_prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_segment_prompt_history_user ON ai_segment_prompt_history(user_id, created_at DESC);

ALTER TABLE ai_segment_prompt_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_ai_segment_prompt_history ON ai_segment_prompt_history;
CREATE POLICY ws_select_ai_segment_prompt_history ON ai_segment_prompt_history
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS ws_insert_ai_segment_prompt_history ON ai_segment_prompt_history;
CREATE POLICY ws_insert_ai_segment_prompt_history ON ai_segment_prompt_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ws_delete_ai_segment_prompt_history ON ai_segment_prompt_history;
CREATE POLICY ws_delete_ai_segment_prompt_history ON ai_segment_prompt_history
  FOR DELETE USING (user_id = auth.uid());
