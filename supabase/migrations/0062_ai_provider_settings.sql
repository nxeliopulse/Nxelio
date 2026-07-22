-- ============================================================================
-- AI provider settings — platform-wide (not per-workspace), Super Admin panel
-- (/admin) only. Lets the platform admin toggle which AI provider (OpenAI or
-- Groq) powers every AI feature across the whole app — lead scoring, the AI
-- Assistant, content generation, etc. — without editing env vars and
-- redeploying. Actual API keys stay in env vars (OPENAI_API_KEY, GROQ_API_KEY,
-- etc.) — this table only stores WHICH provider is currently active.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single-row table
  active_provider  TEXT NOT NULL DEFAULT 'openai' CHECK (active_provider IN ('openai', 'groq')),
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO ai_provider_settings (id, active_provider)
VALUES (1, 'openai')
ON CONFLICT (id) DO NOTHING;

-- RLS enabled with NO policies for any role — only the service-role admin
-- client (used exclusively by the /admin panel and the AI client resolver)
-- can reach this table at all.
ALTER TABLE ai_provider_settings ENABLE ROW LEVEL SECURITY;
