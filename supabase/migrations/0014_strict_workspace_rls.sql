-- Fix: remove the old broad RLS policies that were leaking data across workspaces.
-- After this migration, only the ws_* workspace-scoped policies remain.

DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'segments','segment_rules','segment_members',
    'campaigns','campaign_templates','campaign_template_steps','ai_prompt_templates',
    'workflows','workflow_executions','sequences','sequence_steps',
    'newsletters','newsletter_recipients','email_templates',
    'blocklist','inbox_messages','lead_activities','user_permissions'
  ]) LOOP
    -- Drop every policy on this table that is NOT one of our new ws_* policies
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE tablename = t
        AND policyname NOT LIKE 'ws_%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Notifications: re-create the per-user + workspace scope (the migration loop above
-- skipped notifications, but we want to make sure no leftover broad SELECT exists).
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE tablename = 'notifications' AND policyname NOT LIKE 'Users %' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications;', p.policyname);
  END LOOP;
END $$;
