-- Phase 5: durable AI memory for workspace preferences and user preferences.
-- Values are intentionally plain text and are rejected by the server action
-- when they contain credentials or private keys.
CREATE TABLE IF NOT EXISTS ai_workspace_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_key     TEXT NOT NULL,
  scope         TEXT NOT NULL CHECK (scope IN ('workspace', 'user')),
  category      TEXT NOT NULL CHECK (category IN ('preference', 'tone', 'branding', 'workflow', 'template', 'audience', 'context', 'custom')),
  memory_key    TEXT NOT NULL CHECK (length(memory_key) BETWEEN 1 AND 120),
  value         TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 4000),
  source        TEXT DEFAULT 'assistant',
  expires_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_memory_scope_owner_check CHECK (
    (scope = 'workspace' AND user_id IS NULL AND owner_key = 'workspace') OR
    (scope = 'user' AND user_id IS NOT NULL AND owner_key = user_id::TEXT)
  ),
  UNIQUE (workspace_id, owner_key, memory_key)
);

CREATE INDEX IF NOT EXISTS ai_workspace_memory_search_idx
  ON ai_workspace_memory(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_workspace_memory_expiry_idx
  ON ai_workspace_memory(workspace_id, expires_at)
  WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS ai_workspace_memory_updated_at ON ai_workspace_memory;
CREATE TRIGGER ai_workspace_memory_updated_at
  BEFORE UPDATE ON ai_workspace_memory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_workspace_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_memory_select ON ai_workspace_memory;
CREATE POLICY ai_memory_select ON ai_workspace_memory FOR SELECT TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND (scope = 'workspace' OR user_id = auth.uid())
    AND (expires_at IS NULL OR expires_at > now())
  );

-- No direct client INSERT/UPDATE/DELETE policies. Server actions use the
-- service-role client only after checking the caller and scope.
