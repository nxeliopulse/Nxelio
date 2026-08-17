-- ============================================================================
-- 0130_ai_recommendations.sql
--
-- Phase 2 item: turns the AI Insights already computed across 8 analytics
-- pages (Prospects, Segments, Campaigns, Engagement, Meetings, Pipeline,
-- Revenue, Accounts) from stateless, recomputed-every-page-load text into a
-- tracked recommendation lifecycle — surfaced once, then accepted/dismissed
-- by a user, unlocking a real Recommendation Adoption Rate and (proxy)
-- Outcome Rate on AI Performance Analytics.
--
-- ai_recommendations: one row per distinct insight ever surfaced, keyed by a
-- stable fingerprint ("<area>:<insight id>") so re-computing the same
-- insight on a later page load bumps last_seen_at instead of duplicating.
-- ai_recommendation_actions: an append-only log of every accept/dismiss, for
-- audit/history — ai_recommendations.status holds the current state.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_area    TEXT NOT NULL,
  fingerprint    TEXT NOT NULL,
  title          TEXT NOT NULL,
  cta_label      TEXT NOT NULL,
  cta_href       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'accepted', 'dismissed')),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actioned_at    TIMESTAMPTZ,
  actioned_by    UUID REFERENCES users(user_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_workspace ON ai_recommendations (workspace_id, status);

DROP TRIGGER IF EXISTS trg_ai_recommendations_updated ON ai_recommendations;
CREATE TRIGGER trg_ai_recommendations_updated
  BEFORE UPDATE ON ai_recommendations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS ai_recommendation_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES ai_recommendations(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(user_id),
  action            TEXT NOT NULL CHECK (action IN ('accepted', 'dismissed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendation_actions_rec ON ai_recommendation_actions (recommendation_id);

ALTER TABLE ai_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendation_actions ENABLE ROW LEVEL SECURITY;

-- Any workspace member can read, record a sighting, or act on a
-- recommendation — insights are shown to whoever views the analytics page,
-- not just admins.
DROP POLICY IF EXISTS ai_recommendations_read ON ai_recommendations;
CREATE POLICY ai_recommendations_read
  ON ai_recommendations FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS ai_recommendations_write ON ai_recommendations;
CREATE POLICY ai_recommendations_write
  ON ai_recommendations FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS ai_recommendations_update ON ai_recommendations;
CREATE POLICY ai_recommendations_update
  ON ai_recommendations FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  ) WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS ai_recommendation_actions_read ON ai_recommendation_actions;
CREATE POLICY ai_recommendation_actions_read
  ON ai_recommendation_actions FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS ai_recommendation_actions_write ON ai_recommendation_actions;
CREATE POLICY ai_recommendation_actions_write
  ON ai_recommendation_actions FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );
