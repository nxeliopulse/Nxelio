-- ============================================================================
-- Notifications: per-user activity bell feed
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own notifications" ON notifications;
CREATE POLICY "Read own notifications" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Insert notifications" ON notifications;
CREATE POLICY "Insert notifications" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Update own notifications" ON notifications;
CREATE POLICY "Update own notifications" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- Seed: 5 demo notifications for primary admin user
-- ============================================================================
DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users
    WHERE email = 'harirajanncse@gmail.com'
    LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users
      WHERE email = 'admin@leadpro.ai'
      LIMIT 1;
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at) VALUES
      (v_user_id, 'hot_lead', 'New hot lead detected',
        'Acme Corp scored 92 — they viewed pricing 3 times this week.',
        '/leads', FALSE, NOW() - INTERVAL '5 minutes'),
      (v_user_id, 'reply', 'New reply from Sarah Chen',
        'Sarah replied to your follow-up about the Q2 demo.',
        '/inbox', FALSE, NOW() - INTERVAL '1 hour'),
      (v_user_id, 'campaign_done', 'Campaign "Spring Outreach" finished',
        '248 emails sent, 31% open rate, 7 replies.',
        '/campaigns', FALSE, NOW() - INTERVAL '3 hours'),
      (v_user_id, 'workflow_ran', 'Workflow "Hot Lead Alert" ran',
        'Triggered 4 times in the last 24 hours.',
        '/workflows', TRUE, NOW() - INTERVAL '1 day'),
      (v_user_id, 'ai_usage', 'AI credits update',
        'You have used 1,820 of 5,000 AI credits this month.',
        '/settings', TRUE, NOW() - INTERVAL '2 days');
  END IF;
END $$;
