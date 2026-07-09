-- Persistent chat history for the in-app AI assistant.
CREATE TABLE IF NOT EXISTS assistant_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_chats_user ON assistant_chats(user_id, updated_at DESC);

ALTER TABLE assistant_chats ENABLE ROW LEVEL SECURITY;

-- Chats are private to the user who created them.
CREATE POLICY "own_select_assistant_chats" ON assistant_chats FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_insert_assistant_chats" ON assistant_chats FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_assistant_chats" ON assistant_chats FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own_delete_assistant_chats" ON assistant_chats FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Auto-fill workspace_id like other tenant tables.
DROP TRIGGER IF EXISTS auto_workspace_trigger ON assistant_chats;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON assistant_chats
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();
