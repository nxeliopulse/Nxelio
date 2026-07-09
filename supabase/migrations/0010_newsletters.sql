-- ============================================================================
-- Newsletters: content blasts to existing/subscribed leads
-- ============================================================================

-- Subscribed state on leads (default true — explicit unsubscribe handled later)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_subscribed BOOLEAN DEFAULT TRUE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Newsletters table
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  preheader VARCHAR(255),
  content JSONB NOT NULL DEFAULT '{"blocks":[]}'::jsonb,
  status VARCHAR(20) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Scheduled', 'Sending', 'Sent', 'Failed')),
  audience_type VARCHAR(20) DEFAULT 'all' CHECK (audience_type IN ('all', 'segment')),
  segment_id UUID REFERENCES segments(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  open_count INT DEFAULT 0,
  click_count INT DEFAULT 0,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletters_status ON newsletters(status);
CREATE INDEX IF NOT EXISTS idx_newsletters_owner ON newsletters(owner_id);

-- Auto-set owner on insert
CREATE OR REPLACE FUNCTION set_newsletter_owner() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN NEW.owner_id = auth.uid(); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_newsletter_owner_trigger ON newsletters;
CREATE TRIGGER set_newsletter_owner_trigger BEFORE INSERT ON newsletters FOR EACH ROW EXECUTE FUNCTION set_newsletter_owner();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_newsletter_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_newsletter_updated_at_trigger ON newsletters;
CREATE TRIGGER update_newsletter_updated_at_trigger BEFORE UPDATE ON newsletters FOR EACH ROW EXECUTE FUNCTION update_newsletter_updated_at();

-- Newsletter recipients (delivery + engagement tracking)
CREATE TABLE IF NOT EXISTS newsletter_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'opened', 'clicked')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_recipients_newsletter ON newsletter_recipients(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_recipients_lead ON newsletter_recipients(lead_id);

-- RLS
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read scoped newsletters" ON newsletters;
CREATE POLICY "Read scoped newsletters" ON newsletters FOR SELECT TO authenticated
  USING (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid());
DROP POLICY IF EXISTS "Authenticated insert newsletters" ON newsletters;
CREATE POLICY "Authenticated insert newsletters" ON newsletters FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Scoped update newsletters" ON newsletters;
CREATE POLICY "Scoped update newsletters" ON newsletters FOR UPDATE TO authenticated
  USING (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid());
DROP POLICY IF EXISTS "Scoped delete newsletters" ON newsletters;
CREATE POLICY "Scoped delete newsletters" ON newsletters FOR DELETE TO authenticated
  USING (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid());

ALTER TABLE newsletter_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated all on newsletter_recipients" ON newsletter_recipients;
CREATE POLICY "Authenticated all on newsletter_recipients" ON newsletter_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed 3 demo newsletters for the admin user
DO $$
DECLARE target_user UUID;
BEGIN
  SELECT user_id INTO target_user FROM users WHERE role_id = 1 LIMIT 1;
  IF target_user IS NOT NULL THEN
    INSERT INTO newsletters (title, subject, preheader, content, status, sent_at, recipient_count, sent_count, open_count, click_count, owner_id) VALUES
      ('March Product Update',
       'New AI features just shipped',
       'See what we built this month',
       '{"blocks":[{"type":"heading","text":"March Product Update"},{"type":"paragraph","text":"This month we shipped three major upgrades to LeadPro: real-time AI scoring, custom workflow builder, and a brand-new analytics dashboard."},{"type":"cta","text":"See what is new","url":"https://leadpro.ai/changelog"},{"type":"paragraph","text":"Thanks for being part of the journey."}]}'::jsonb,
       'Sent', now() - interval '14 days', 142, 138, 72, 18, target_user),
      ('How top SDRs use AI in 2026',
       'The 5-step playbook the best teams use',
       'Real workflows from teams hitting 3x quota',
       '{"blocks":[{"type":"heading","text":"How top SDRs use AI in 2026"},{"type":"paragraph","text":"We analyzed the workflows of 100+ top-performing SDRs to find what separates the best from the rest."},{"type":"paragraph","text":"Here are the 5 patterns that show up again and again..."},{"type":"cta","text":"Read the full breakdown","url":"https://leadpro.ai/blog/sdr-playbook"}]}'::jsonb,
       'Sent', now() - interval '7 days', 142, 140, 81, 24, target_user),
      ('Weekly digest — draft', 'Your weekly LeadPro digest', NULL,
       '{"blocks":[{"type":"heading","text":"Your weekly digest"},{"type":"paragraph","text":"Here is what happened in your pipeline this week."}]}'::jsonb,
       'Draft', NULL, 0, 0, 0, 0, target_user)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
