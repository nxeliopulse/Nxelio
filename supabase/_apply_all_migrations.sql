-- ============================================================================
-- Nxelio -- FULL DATABASE INITIALIZATION
-- Regenerated: correct migrations in apply order. App-code-aligned schema.
-- Run ONCE in the Supabase SQL Editor on a fresh (empty) project.
-- ============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0001_initial_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- LeadPro — Initial Schema
-- 19 tables covering: users, leads, segments, campaigns, workflows, analytics
-- ============================================================================

-- Helper: updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. ROLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) UNIQUE NOT NULL,
  role_description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO roles (role_name, role_description) VALUES
  ('Admin', 'Full system access'),
  ('Manager', 'Manages a team of Sales Reps'),
  ('Sales Rep', 'Works on assigned leads')
ON CONFLICT (role_name) DO NOTHING;

-- ============================================================================
-- 2. USERS (profiles linked to auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role_id INT REFERENCES roles(role_id),
  manager_id UUID REFERENCES users(user_id),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  avatar_url TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. MENUS
-- ============================================================================
CREATE TABLE IF NOT EXISTS menus (
  menu_id SERIAL PRIMARY KEY,
  menu_name VARCHAR(100) UNIQUE NOT NULL,
  menu_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO menus (menu_name) VALUES
  ('Leads'), ('Campaign'), ('Segment'), ('Workflow'),
  ('Templates'), ('Analytics'), ('Inbox'), ('Settings')
ON CONFLICT (menu_name) DO NOTHING;

-- ============================================================================
-- 4. USER PERMISSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_permissions (
  permission_id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  menu_id INT NOT NULL REFERENCES menus(menu_id),
  can_create BOOLEAN DEFAULT FALSE,
  can_upload BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_view BOOLEAN DEFAULT TRUE,
  assigned_by UUID REFERENCES users(user_id),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, menu_id)
);

-- ============================================================================
-- 5. LEADS
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150),
  email VARCHAR(255),
  phone VARCHAR(50),
  company_name VARCHAR(200),
  industry VARCHAR(100),
  interest_area VARCHAR(150),
  source VARCHAR(100),
  message TEXT,
  linkedin VARCHAR(500),
  website_url VARCHAR(500),
  lead_score INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'New',
  verified BOOLEAN DEFAULT FALSE,
  owner_id UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT lead_identity_check CHECK (full_name IS NOT NULL OR company_name IS NOT NULL),
  CONSTRAINT lead_contact_check CHECK (email IS NOT NULL OR website_url IS NOT NULL)
);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_owner ON leads(owner_id);
CREATE INDEX idx_leads_score ON leads(lead_score DESC);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. LEAD ACTIVITIES (event log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  metadata JSONB,
  score_delta INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_activities_lead ON lead_activities(lead_id, created_at DESC);

-- ============================================================================
-- 7-9. SEGMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_name VARCHAR(200) NOT NULL,
  description TEXT,
  segment_type VARCHAR(50) DEFAULT 'Dynamic',
  status VARCHAR(20) DEFAULT 'Active',
  logic_type VARCHAR(10) DEFAULT 'AND',
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_segments_updated BEFORE UPDATE ON segments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS segment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  field VARCHAR(100) NOT NULL,
  operator VARCHAR(50) NOT NULL,
  value TEXT,
  rule_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS segment_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(segment_id, lead_id)
);

-- ============================================================================
-- 10-13. CAMPAIGNS
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name VARCHAR(200) NOT NULL,
  campaign_type VARCHAR(50),
  segment_id UUID REFERENCES segments(id),
  subject VARCHAR(500),
  content TEXT,
  status VARCHAR(20) DEFAULT 'Draft',
  scheduled_at TIMESTAMPTZ,
  sent_count INT DEFAULT 0,
  open_rate NUMERIC(5,2) DEFAULT 0,
  reply_rate NUMERIC(5,2) DEFAULT 0,
  bounce_rate NUMERIC(5,2) DEFAULT 0,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS campaign_templates (
  template_id SERIAL PRIMARY KEY,
  template_name VARCHAR(150) NOT NULL,
  template_type VARCHAR(100),
  description TEXT,
  goal TEXT,
  target_audience VARCHAR(150),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_template_steps (
  step_id SERIAL PRIMARY KEY,
  template_id INT REFERENCES campaign_templates(template_id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  step_name VARCHAR(150),
  subject_line VARCHAR(500),
  email_body TEXT,
  delay_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  prompt_id SERIAL PRIMARY KEY,
  template_id INT REFERENCES campaign_templates(template_id) ON DELETE CASCADE,
  prompt_name VARCHAR(150),
  prompt_text TEXT NOT NULL,
  ai_tone VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 14-16. EMAIL TEMPLATES + SEQUENCES
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  subject VARCHAR(500),
  body TEXT,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_email_templates_updated BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_name VARCHAR(200) NOT NULL,
  trigger_type VARCHAR(100),
  status VARCHAR(20) DEFAULT 'Draft',
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  action_type VARCHAR(50),
  wait_days INT DEFAULT 0,
  template_id UUID REFERENCES email_templates(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 17-18. WORKFLOWS
-- ============================================================================
CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name VARCHAR(200) NOT NULL,
  description TEXT,
  folder VARCHAR(50) DEFAULT 'Lead Generation',
  status VARCHAR(20) DEFAULT 'Draft',
  config JSONB,
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON workflows FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id),
  status VARCHAR(20) DEFAULT 'Running',
  result JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_executions_workflow ON workflow_executions(workflow_id, started_at DESC);

-- ============================================================================
-- 19. INBOX MESSAGES
-- ============================================================================
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),
  direction VARCHAR(10) NOT NULL,
  subject VARCHAR(500),
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_inbox_lead ON inbox_messages(lead_id, created_at DESC);
CREATE INDEX idx_inbox_unread ON inbox_messages(is_read) WHERE is_read = FALSE;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0002_rls_and_triggers.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- RLS Policies — Users can only access their workspace data
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE segment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- USERS — see self + (if Admin) see everyone
-- ----------------------------------------------------------------------------
CREATE POLICY "Users read own profile or admin reads all" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1)
  );

CREATE POLICY "Admin can insert users" ON users FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1)
    OR auth.uid() = user_id
  );

CREATE POLICY "Admin can update users, users update self" ON users FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1)
  );

CREATE POLICY "Admin can delete users" ON users FOR DELETE
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id = 1));

-- ----------------------------------------------------------------------------
-- LEADS — authenticated users can read all, admins/managers can modify
-- ----------------------------------------------------------------------------
CREATE POLICY "Authenticated read all leads" ON leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Manager create leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
  );

CREATE POLICY "Admin/Manager update leads" ON leads FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
    OR owner_id = auth.uid()
  );

CREATE POLICY "Admin/Manager delete leads" ON leads FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2)));

-- ----------------------------------------------------------------------------
-- LEAD ACTIVITIES — read all, system inserts
-- ----------------------------------------------------------------------------
CREATE POLICY "Authenticated read activities" ON lead_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert activities" ON lead_activities FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- SEGMENTS / CAMPAIGNS / TEMPLATES / WORKFLOWS / INBOX — all authenticated CRUD
-- ----------------------------------------------------------------------------
CREATE POLICY "Authenticated all on segments" ON segments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on segment_rules" ON segment_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on segment_members" ON segment_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on campaigns" ON campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on email_templates" ON email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated all on workflows" ON workflows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read executions" ON workflow_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert executions" ON workflow_executions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated all on inbox" ON inbox_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin all on permissions" ON user_permissions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
    OR user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role_id IN (1, 2))
  );

-- ============================================================================
-- AUTO-CREATE USER PROFILE on signup
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
DECLARE
  default_role INT;
  user_count INT;
BEGIN
  -- First user becomes Admin, everyone else Sales Rep
  SELECT COUNT(*) INTO user_count FROM public.users;
  IF user_count = 0 THEN
    default_role := 1;  -- Admin
  ELSE
    default_role := 3;  -- Sales Rep
  END IF;

  INSERT INTO public.users (user_id, email, full_name, role_id, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    default_role,
    'ACTIVE'
  );

  -- Grant view permissions to all menus by default
  INSERT INTO public.user_permissions (user_id, menu_id, can_view)
  SELECT NEW.id, menu_id, TRUE FROM public.menus;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0003_seed_data.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Seed sample leads + email templates (idempotent)
-- ============================================================================

INSERT INTO leads (full_name, email, phone, company_name, industry, interest_area, source, linkedin, website_url, lead_score, status)
VALUES
  ('Anuradha Ramachandran', 'anu.ramachandran@gmail.com', '+1 415 555 0142', 'Visionary AI', 'Technology', 'CRM Automation', 'Website Form', 'linkedin.com/in/anuradha', 'visionary-ai.com', 88, 'Hot'),
  ('John Smith', 'john.smith@abccorp.com', '+1 212 555 0198', 'ABC Corp', 'Consulting', 'SAP AI', 'Ebook Download', 'linkedin.com/in/johnsmith', 'abccorp.com', 72, 'Warm'),
  ('Priya Sharma', 'priya@enterprise.io', '+91 98765 43210', 'Enterprise Solutions', 'Enterprise Software', 'Digital Transformation', 'Webinar', 'linkedin.com/in/priyasharma', 'enterprise.io', 91, 'Hot'),
  ('Michael Chen', 'm.chen@datacore.com', '+1 650 555 0177', 'DataCore Analytics', 'Analytics', 'AI Platforms', 'LinkedIn', 'linkedin.com/in/michaelchen', 'datacore.com', 65, 'Warm'),
  ('Sarah Johnson', 'sarah.j@northwind.com', '+1 312 555 0199', 'Northwind Traders', 'Retail', 'Customer Engagement', 'Cold Email', 'linkedin.com/in/sarahjohnson', 'northwind.com', 45, 'New'),
  ('Raj Patel', 'raj.patel@cloudshift.io', '+1 408 555 0123', 'CloudShift', 'Cloud Services', 'Workflow Automation', 'Referral', 'linkedin.com/in/rajpatel', 'cloudshift.io', 79, 'Hot'),
  ('Emily Davis', 'emily@nexustech.com', '+1 503 555 0188', 'Nexus Tech', 'Technology', 'AI Personalization', 'Webinar', 'linkedin.com/in/emilydavis', 'nexustech.com', 58, 'Warm'),
  ('Daniel Kim', 'd.kim@brightpath.co', '+1 206 555 0142', 'BrightPath Coaching', 'Training', 'Lead Nurturing', 'Website Form', 'linkedin.com/in/danielkim', 'brightpath.co', 95, 'Converted'),
  ('Lisa Wang', 'lisa.wang@globex.com', '+1 713 555 0134', 'Globex Industries', 'Manufacturing', 'Lead Scoring', 'Cold Email', 'linkedin.com/in/lisawang', 'globex.com', 38, 'New'),
  ('Carlos Mendez', 'carlos@advanta.es', '+34 91 555 0111', 'Advanta Group', 'Consulting', 'SAP AI', 'Ebook Download', 'linkedin.com/in/carlosmendez', 'advanta.es', 82, 'Hot')
ON CONFLICT DO NOTHING;

INSERT INTO email_templates (template_name, subject, body) VALUES
  ('Welcome Email', 'Welcome to {{companyName}} — let''s get started', 'Hi {{firstName}}, welcome to LeadPro!'),
  ('Demo Booking', 'Quick question — 15 min demo?', 'Hi {{firstName}}, I noticed {{companyName}} is in {{industry}}...'),
  ('Follow-up #2', 'Following up on {{topic}}', 'Hi {{firstName}}, ...'),
  ('Webinar Reminder', 'Reminder: {{eventName}} starts in 1 hour', 'Hi {{firstName}}, ...'),
  ('Case Study Share', 'How {{caseStudyCompany}} achieved 3x growth', 'Hi {{firstName}}, ...')
ON CONFLICT DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0004_richer_seed.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Richer demo data: segments, campaigns, workflows, activities, inbox
-- ============================================================================

-- SEGMENTS
INSERT INTO segments (segment_name, description, segment_type, status) VALUES
  ('SAP Professionals', 'Decision makers in SAP consulting firms', 'Dynamic', 'Active'),
  ('CIO / IT Leaders', 'C-level technology executives', 'Behavioral', 'Active'),
  ('Webinar Attendees', 'Attended at least one webinar in last 90 days', 'Engagement', 'Active'),
  ('Content Downloaders', 'Downloaded any ebook or guide', 'Behavioral', 'Active'),
  ('High Intent CRM Leads', 'Score > 70 + visited pricing page', 'Dynamic', 'Active'),
  ('Cold Re-engagement', 'No engagement for 60+ days', 'Engagement', 'Paused'),
  ('Enterprise Manufacturing', 'Manufacturing companies > 1000 employees', 'Dynamic', 'Draft')
ON CONFLICT DO NOTHING;

-- Add some rules to High Intent CRM Leads
INSERT INTO segment_rules (segment_id, field, operator, value, rule_order)
SELECT s.id, 'Industry', 'equals', 'Technology', 0 FROM segments s WHERE s.segment_name = 'High Intent CRM Leads'
ON CONFLICT DO NOTHING;
INSERT INTO segment_rules (segment_id, field, operator, value, rule_order)
SELECT s.id, 'Interest Area', 'equals', 'CRM Automation', 1 FROM segments s WHERE s.segment_name = 'High Intent CRM Leads'
ON CONFLICT DO NOTHING;
INSERT INTO segment_rules (segment_id, field, operator, value, rule_order)
SELECT s.id, 'Lead Score', 'greater than', '70', 2 FROM segments s WHERE s.segment_name = 'High Intent CRM Leads'
ON CONFLICT DO NOTHING;

-- CAMPAIGNS
INSERT INTO campaigns (campaign_name, status, sent_count, open_rate, reply_rate, bounce_rate) VALUES
  ('SAP AI Transformation — Q2', 'Active', 3744, 48.2, 12.4, 2.1),
  ('Webinar Follow-up Sequence', 'Active', 2676, 56.1, 18.7, 1.4),
  ('Cold Outreach — CIO List', 'Paused', 1161, 38.4, 8.2, 3.5),
  ('Welcome Letter — New Signups', 'Active', 524, 71.2, 22.1, 0.8),
  ('Product Launch Announcement', 'Draft', 0, 0, 0, 0),
  ('Re-engagement Sequence', 'Completed', 1935, 32.8, 6.4, 4.2)
ON CONFLICT DO NOTHING;

-- WORKFLOWS
INSERT INTO workflows (workflow_name, description, folder, status) VALUES
  ('Lead Capture & Welcome Email', 'Triggered when new lead submits website form', 'Lead Generation', 'Active'),
  ('Webinar Registration Flow', 'Confirmation + reminders + follow-up', 'Marketing', 'Active'),
  ('Hot Lead Alert', 'Notify sales when score crosses 80', 'Lead Generation', 'Active'),
  ('Re-Engagement Sequence', 'Inactive 30 days → automated nurture', 'Marketing', 'Active'),
  ('Support Ticket Routing', 'Auto-assign tickets based on category', 'Customer Support', 'Paused'),
  ('Internal Daily Report', 'Email summary of leads to managers', 'Internal', 'Active')
ON CONFLICT DO NOTHING;

-- LEAD ACTIVITIES (timeline events on existing leads)
INSERT INTO lead_activities (lead_id, activity_type, score_delta, metadata)
SELECT l.id, 'PAGE_VISITED', 5, '{"page": "/pricing"}'::jsonb
FROM leads l WHERE l.email = 'anu.ramachandran@gmail.com';

INSERT INTO lead_activities (lead_id, activity_type, score_delta, metadata)
SELECT l.id, 'EMAIL_OPENED', 1, '{"campaign": "SAP AI Q2"}'::jsonb
FROM leads l WHERE l.email = 'priya@enterprise.io';

INSERT INTO lead_activities (lead_id, activity_type, score_delta, metadata)
SELECT l.id, 'GUIDE_DOWNLOADED', 10, '{"guide": "SAP_AI_TRANSFORMATION_GUIDE"}'::jsonb
FROM leads l WHERE l.email = 'john.smith@abccorp.com';

INSERT INTO lead_activities (lead_id, activity_type, score_delta, metadata)
SELECT l.id, 'WEBINAR_ATTENDED', 15, '{"webinar": "AI ROI for SAP"}'::jsonb
FROM leads l WHERE l.email = 'carlos@advanta.es';

INSERT INTO lead_activities (lead_id, activity_type, score_delta, metadata)
SELECT l.id, 'EMAIL_CLICKED', 5, '{"link": "case-study"}'::jsonb
FROM leads l WHERE l.email = 'm.chen@datacore.com';

INSERT INTO lead_activities (lead_id, activity_type, score_delta, metadata)
SELECT l.id, 'CONSULTATION_REQUESTED', 40, '{"slot": "Thursday 2pm"}'::jsonb
FROM leads l WHERE l.email = 'd.kim@brightpath.co';

INSERT INTO lead_activities (lead_id, activity_type, score_delta, metadata)
SELECT l.id, 'LEAD_SCORE_UPDATED', 0, '{"old": 75, "new": 79}'::jsonb
FROM leads l WHERE l.email = 'raj.patel@cloudshift.io';

-- INBOX MESSAGES (simulated replies)
INSERT INTO inbox_messages (lead_id, direction, subject, body, is_read)
SELECT l.id, 'inbound', 'Re: Quick question — 15 min demo?',
  'Yes, I''d love to schedule a demo for next week. What times work best?', FALSE
FROM leads l WHERE l.email = 'priya@enterprise.io';

INSERT INTO inbox_messages (lead_id, direction, subject, body, is_read)
SELECT l.id, 'inbound', 'Re: Welcome to LeadPro',
  'Thanks for the guide. Can you share more about your pricing structure?', FALSE
FROM leads l WHERE l.email = 'john.smith@abccorp.com';

INSERT INTO inbox_messages (lead_id, direction, subject, body, is_read)
SELECT l.id, 'inbound', 'Re: Demo Booking',
  'Confirmed for Thursday at 2pm. Looking forward to it.', TRUE
FROM leads l WHERE l.email = 'd.kim@brightpath.co';

INSERT INTO inbox_messages (lead_id, direction, subject, body, is_read)
SELECT l.id, 'inbound', 'Re: Outreach',
  'Not interested at this time. Please remove me from your list.', TRUE
FROM leads l WHERE l.email = 'carlos@advanta.es';

INSERT INTO inbox_messages (lead_id, direction, subject, body, is_read)
SELECT l.id, 'inbound', 'Re: AI Personalization',
  'Could you send me the case study you mentioned?', TRUE
FROM leads l WHERE l.email = 'emily@nexustech.com';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0005_fix_rls_recursion.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Fix RLS recursion: policies that query users from within users policy
-- ============================================================================

CREATE OR REPLACE FUNCTION get_current_user_role_id() RETURNS INT AS $$
  SELECT role_id FROM public.users WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Users
DROP POLICY IF EXISTS "Users read own profile or admin reads all" ON users;
CREATE POLICY "Users read own profile or admin reads all" ON users FOR SELECT
  USING (user_id = auth.uid() OR get_current_user_role_id() = 1);

DROP POLICY IF EXISTS "Admin can insert users" ON users;
CREATE POLICY "Admin can insert users" ON users FOR INSERT
  WITH CHECK (get_current_user_role_id() = 1 OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can update users, users update self" ON users;
CREATE POLICY "Admin can update users, users update self" ON users FOR UPDATE
  USING (user_id = auth.uid() OR get_current_user_role_id() = 1);

DROP POLICY IF EXISTS "Admin can delete users" ON users;
CREATE POLICY "Admin can delete users" ON users FOR DELETE
  USING (get_current_user_role_id() = 1);

-- Leads
DROP POLICY IF EXISTS "Admin/Manager create leads" ON leads;
CREATE POLICY "Admin/Manager create leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (get_current_user_role_id() IN (1, 2));

DROP POLICY IF EXISTS "Admin/Manager update leads" ON leads;
CREATE POLICY "Admin/Manager update leads" ON leads FOR UPDATE TO authenticated
  USING (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Admin/Manager delete leads" ON leads;
CREATE POLICY "Admin/Manager delete leads" ON leads FOR DELETE TO authenticated
  USING (get_current_user_role_id() IN (1, 2));

-- Permissions
DROP POLICY IF EXISTS "Admin all on permissions" ON user_permissions;
CREATE POLICY "Admin all on permissions" ON user_permissions FOR ALL TO authenticated
  USING (get_current_user_role_id() IN (1, 2) OR user_id = auth.uid())
  WITH CHECK (get_current_user_role_id() IN (1, 2));


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0006_blocklist.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Blocklist: emails / domains excluded from all outbound campaigns
-- ============================================================================
CREATE TABLE IF NOT EXISTS blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value VARCHAR(255) NOT NULL UNIQUE,
  reason TEXT,
  added_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blocklist_value ON blocklist(LOWER(value));

ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated all on blocklist" ON blocklist FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO blocklist (value, reason) VALUES
  ('competitor.com', 'Competitor domain'),
  ('@example.org', 'Example domain'),
  ('spam@bad.com', 'Reported spam')
ON CONFLICT (value) DO NOTHING;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0007_public_capture.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Allow anonymous lead capture from public form
-- ============================================================================
CREATE POLICY "Anon can capture leads" ON leads FOR INSERT TO anon
  WITH CHECK (
    -- Only allow inserts from public source values
    source IN ('Website Form', 'Public Capture Form', 'Embed Form')
    AND status = 'New'
  );

CREATE POLICY "Anon can log capture activity" ON lead_activities FOR INSERT TO anon
  WITH CHECK (activity_type IN ('LEAD_CREATED', 'GUIDE_DOWNLOADED'));


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0008_notifications.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0009_per_user_data.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Per-user data scoping for leads
-- ============================================================================

-- owner_id already exists in 0001 referencing users(user_id); make sure it
-- exists as an auth.users reference (idempotent — column add only if missing).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Default owner_id to the currently authenticated user on insert
CREATE OR REPLACE FUNCTION set_lead_owner() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_lead_owner ON leads;
CREATE TRIGGER trg_set_lead_owner
  BEFORE INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION set_lead_owner();

-- Promote primary admin
UPDATE users SET role_id = 1 WHERE email = 'harirajanncse@gmail.com';

-- Backfill any leads with no owner to the admin
UPDATE leads
  SET owner_id = (SELECT user_id FROM users WHERE role_id = 1 LIMIT 1)
  WHERE owner_id IS NULL;

-- Replace the read-all policy with a scoped one
DROP POLICY IF EXISTS "Authenticated read leads" ON leads;
DROP POLICY IF EXISTS "Authenticated read all leads" ON leads;
DROP POLICY IF EXISTS "Read scoped leads" ON leads;
CREATE POLICY "Read scoped leads" ON leads
  FOR SELECT TO authenticated
  USING (
    get_current_user_role_id() IN (1, 2)
    OR owner_id = auth.uid()
  );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0010_newsletters.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0012_workspaces.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Multi-tenant workspaces — every signup creates a fresh tenant
-- Existing data is moved to a single "Legacy Workspace" so it doesn't vanish
-- ============================================================================

-- 1. Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- 2. Add workspace_id to every tenant-scoped table
ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE segment_rules ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE segment_members ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE newsletter_recipients ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE blocklist ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE inbox_messages ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE campaign_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE campaign_template_steps ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE ai_prompt_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- 3. Helper: get current user's workspace_id (SECURITY DEFINER avoids recursion)
CREATE OR REPLACE FUNCTION get_current_workspace_id() RETURNS UUID AS $$
  SELECT workspace_id FROM public.users WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 4. Backfill: move all existing data into ONE "Legacy Workspace" so existing admins keep working
DO $$
DECLARE
  legacy_ws UUID;
  legacy_admin UUID;
BEGIN
  -- Find the original admin user
  SELECT user_id INTO legacy_admin FROM users WHERE role_id = 1 ORDER BY created_at LIMIT 1;

  -- Re-use existing workspace if any, else create
  SELECT id INTO legacy_ws FROM workspaces WHERE name = 'Legacy Workspace' LIMIT 1;
  IF legacy_ws IS NULL THEN
    INSERT INTO workspaces (name, owner_id) VALUES ('Legacy Workspace', legacy_admin)
    RETURNING id INTO legacy_ws;
  END IF;

  -- Set workspace_id on every existing row that doesn't have one
  UPDATE users               SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE leads               SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE segments            SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE segment_rules       SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE segment_members     SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE campaigns           SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE workflows           SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE workflow_executions SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE newsletters         SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE newsletter_recipients SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE email_templates     SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE notifications       SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE blocklist           SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE inbox_messages      SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE lead_activities     SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
  UPDATE user_permissions    SET workspace_id = legacy_ws WHERE workspace_id IS NULL;
END $$;

-- 5. Trigger: auto-fill workspace_id from current user's workspace on every INSERT
CREATE OR REPLACE FUNCTION set_workspace_from_user() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := get_current_workspace_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads','segments','segment_rules','segment_members',
    'campaigns','workflows','workflow_executions',
    'newsletters','newsletter_recipients','email_templates',
    'notifications','blocklist','inbox_messages','lead_activities','user_permissions'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);
  END LOOP;
END $$;

-- 6. Signup trigger: every new auth.users INSERT creates a workspace + Admin profile
CREATE OR REPLACE FUNCTION handle_new_auth_user_with_workspace() RETURNS TRIGGER AS $$
DECLARE
  new_ws UUID;
  display_name TEXT;
BEGIN
  -- If a public.users row already exists (admin-invited), don't create a workspace
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- New workspace, owned by this user, and they become its Admin
  INSERT INTO workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user_with_workspace();

-- 7. Workspace RLS — users can read their own workspace
DROP POLICY IF EXISTS "Read own workspace" ON workspaces;
CREATE POLICY "Read own workspace" ON workspaces FOR SELECT TO authenticated
  USING (id = get_current_workspace_id());

DROP POLICY IF EXISTS "Owner updates workspace" ON workspaces;
CREATE POLICY "Owner updates workspace" ON workspaces FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

-- 8. Replace user RLS so admins only see their workspace
DROP POLICY IF EXISTS "Users read own profile or admin reads all" ON users;
CREATE POLICY "Workspace users readable by admin/manager" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR (workspace_id = get_current_workspace_id() AND get_current_user_role_id() IN (1, 2))
  );

DROP POLICY IF EXISTS "Admin can update users, users update self" ON users;
CREATE POLICY "Admin updates workspace users; users update self" ON users FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1)
  );

DROP POLICY IF EXISTS "Admin can delete users" ON users;
CREATE POLICY "Admin deletes workspace users" ON users FOR DELETE
  USING (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1);

-- 9. Replace leads RLS — workspace + role-scoped
DROP POLICY IF EXISTS "Read scoped leads" ON leads;
DROP POLICY IF EXISTS "Authenticated read leads" ON leads;
DROP POLICY IF EXISTS "Authenticated read all leads" ON leads;
CREATE POLICY "Workspace leads, role-scoped" ON leads FOR SELECT TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin/Manager create leads" ON leads;
CREATE POLICY "Workspace insert leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Admin/Manager update leads" ON leads;
CREATE POLICY "Workspace update leads" ON leads FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (get_current_user_role_id() IN (1, 2) OR owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admin/Manager delete leads" ON leads;
CREATE POLICY "Workspace delete leads" ON leads FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND get_current_user_role_id() IN (1, 2));

-- Public capture still allowed for anon but routes to the Legacy Workspace
DROP POLICY IF EXISTS "Anon can capture leads" ON leads;
DROP POLICY IF EXISTS "Anon can capture leads to default workspace" ON leads;
CREATE POLICY "Anon can capture leads to default workspace" ON leads FOR INSERT TO anon
  WITH CHECK (
    source IN ('Website Form', 'Public Capture Form', 'Embed Form')
    AND status = 'New'
  );

-- Auto-assign anon leads to Legacy Workspace (since trigger fires before policy)
CREATE OR REPLACE FUNCTION set_anon_lead_workspace() RETURNS TRIGGER AS $$
DECLARE legacy_ws UUID;
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT id INTO legacy_ws FROM workspaces WHERE name = 'Legacy Workspace' LIMIT 1;
    NEW.workspace_id := legacy_ws;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Apply workspace-only RLS to remaining tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'segments','segment_rules','segment_members',
    'campaigns','campaign_templates','campaign_template_steps','ai_prompt_templates',
    'workflows','workflow_executions','sequences','sequence_steps',
    'newsletters','newsletter_recipients','email_templates',
    'blocklist','inbox_messages','lead_activities','user_permissions'
  ]) LOOP
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

-- Notifications: still per-user but ALSO workspace-scoped
DROP POLICY IF EXISTS ws_select_notifications ON notifications;
DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications scoped" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_update_notifications ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
CREATE POLICY "Users update own notifications scoped" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0013_fix_signup_trigger.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Fix: signup trigger was blocked by missing INSERT policy on workspaces

-- 1. Allow service_role + the function definer to insert workspaces
DROP POLICY IF EXISTS "Authenticated insert workspaces" ON workspaces;
CREATE POLICY "Authenticated insert workspaces" ON workspaces FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Rewrite the trigger with exception handling so any failure doesn't break signup
CREATE OR REPLACE FUNCTION handle_new_auth_user_with_workspace() RETURNS TRIGGER AS $$
DECLARE
  new_ws UUID;
  display_name TEXT;
BEGIN
  -- Skip if profile already exists (admin-invited user)
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Create workspace + user profile
  INSERT INTO public.workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log but don't block the auth.users INSERT
    RAISE WARNING 'handle_new_auth_user_with_workspace failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user_with_workspace();


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0014_strict_workspace_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0015_role_restructure_and_capture_slug.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Role restructure: Super Admin / Sales Admin / Marketing Admin
-- Per-workspace public capture URL
-- ============================================================================

-- 1. Rename existing roles
UPDATE roles SET role_name = 'Super Admin',
                 role_description = 'Full access to the workspace including users, billing, and integrations.'
WHERE role_id = 1;

UPDATE roles SET role_name = 'Marketing Admin',
                 role_description = 'Access to segments, newsletters, templates, workflows, and analytics — no sales pipeline.'
WHERE role_id = 2;

UPDATE roles SET role_name = 'Sales Admin',
                 role_description = 'Access to leads, campaigns, inbox, workflows, and analytics — no marketing tools.'
WHERE role_id = 3;

-- 2. Add capture_slug to workspaces (used in public capture URL)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS capture_slug VARCHAR(64) UNIQUE;

-- Generate slugs for existing workspaces
CREATE OR REPLACE FUNCTION generate_capture_slug() RETURNS TEXT AS $$
DECLARE
  alphabet TEXT := 'abcdefghijkmnpqrstuvwxyz23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Backfill slugs for any workspaces that don't have one
UPDATE workspaces SET capture_slug = generate_capture_slug() WHERE capture_slug IS NULL;

-- Trigger: auto-generate slug on new workspace insert
CREATE OR REPLACE FUNCTION set_workspace_slug() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.capture_slug IS NULL THEN
    LOOP
      NEW.capture_slug := generate_capture_slug();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM workspaces WHERE capture_slug = NEW.capture_slug);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_workspace_slug_trigger ON workspaces;
CREATE TRIGGER set_workspace_slug_trigger BEFORE INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION set_workspace_slug();

-- 3. Allow anon to look up a workspace by slug (just so capture form can resolve it)
DROP POLICY IF EXISTS "Anon can read workspace by slug" ON workspaces;
CREATE POLICY "Anon can read workspace by slug" ON workspaces FOR SELECT TO anon
  USING (true);

-- 4. Helper: look up workspace_id from slug (used by capture insert)
CREATE OR REPLACE FUNCTION workspace_id_for_slug(slug TEXT) RETURNS UUID AS $$
  SELECT id FROM workspaces WHERE capture_slug = slug LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0016_outreach.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0016_user_nav_access.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Per-user nav permission overrides on top of role defaults.
-- Shape: { "/leads": true, "/newsletters": false }
-- A present key overrides the role default for that nav item.
-- A missing key falls back to whatever the user's role normally allows.

ALTER TABLE users ADD COLUMN IF NOT EXISTS nav_access JSONB DEFAULT '{}'::jsonb;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0017_outreach_real.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Outreach: real engine
--   * outreach_accounts  — connected Gmail/Outlook + LinkedIn accounts (Unipile)
--   * outreach_jobs       — the scheduled-action queue the cron processor drains
--   * enrollment.next_run — driven by the queue, replies cancel pending jobs
-- The processor runs under the service role (no auth.uid()), so every insert it
-- makes MUST carry workspace_id explicitly — the auto-fill trigger can't help it.
-- ============================================================================

-- 1. Connected sending accounts (one row per mailbox / LinkedIn profile)
CREATE TABLE IF NOT EXISTS outreach_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL DEFAULT 'unipile',
  -- 'email' | 'linkedin'
  channel VARCHAR(20) NOT NULL,
  -- Unipile's account id used when sending
  account_id VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  identifier VARCHAR(255),            -- email address or LinkedIn handle
  -- 'connected' | 'error' | 'disconnected'
  status VARCHAR(20) NOT NULL DEFAULT 'connected',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, account_id)
);

-- 2. The scheduled-action queue. One row = "send this step to this lead at run_at".
CREATE TABLE IF NOT EXISTS outreach_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES outreach_enrollments(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step_id UUID REFERENCES outreach_steps(id) ON DELETE SET NULL,
  step_order INT NOT NULL DEFAULT 1,
  channel VARCHAR(20) NOT NULL,
  action VARCHAR(40) NOT NULL,
  account_id UUID REFERENCES outreach_accounts(id) ON DELETE SET NULL,
  subject VARCHAR(255),
  body TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'pending' | 'sent' | 'failed' | 'skipped' | 'canceled'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- The processor's hot query: pending jobs that are due.
CREATE INDEX IF NOT EXISTS idx_outreach_jobs_due ON outreach_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_outreach_jobs_enrollment ON outreach_jobs(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_outreach_accounts_ws ON outreach_accounts(workspace_id, channel);

-- 3. Workspace auto-fill trigger + RLS (same pattern as 0012 / 0016)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['outreach_accounts','outreach_jobs']) LOOP
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

-- ============================================================================
-- 4. SCHEDULER (run this block once, after filling in the two placeholders).
--    Requires the pg_cron + pg_net extensions (enable in Supabase dashboard:
--    Database → Extensions → enable "pg_cron" and "pg_net").
--    It pings our app's cron route every minute; the route drains due jobs.
--    Left commented because it needs YOUR app URL + a shared secret.
-- ============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- SELECT cron.schedule(
--   'process-outreach',
--   '* * * * *',                          -- every minute
--   $$
--   SELECT net.http_post(
--     url     := 'https://YOUR_APP_URL/api/outreach/cron',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer YOUR_OUTREACH_CRON_SECRET'
--     ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
-- To stop it later:  SELECT cron.unschedule('process-outreach');


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0018_outreach_delay_unit.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Outreach: per-step delay UNIT (minutes | hours | days)
-- delay_days now holds the delay VALUE; delay_unit says what unit it is.
-- Lets you set short delays ("wait 2 minutes") for real-time testing.
-- ============================================================================
ALTER TABLE outreach_steps ADD COLUMN IF NOT EXISTS delay_unit VARCHAR(10) NOT NULL DEFAULT 'days';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0019_fix_workspace_role_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Fix: workspace-scoped RLS policies still used the pre-restructure role IDs
-- (IN (1, 2) = old Admin/Manager). After migration 0015:
--   1 = Super Admin, 2 = Marketing Admin, 3 = Sales Admin.
-- This shut Sales Admin (role 3) out of leads, campaigns, newsletters, etc.
-- Fix: collapse role gating down to workspace membership. Per-tab access is
-- already enforced by role + per-user nav overrides at the UI layer.

-- =========================
-- LEADS — every member of the workspace can read/write workspace leads.
-- =========================
DROP POLICY IF EXISTS "Workspace leads, role-scoped" ON leads;
CREATE POLICY "ws_select_leads" ON leads FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Workspace insert leads" ON leads;
CREATE POLICY "ws_insert_leads" ON leads FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Workspace update leads" ON leads;
CREATE POLICY "ws_update_leads" ON leads FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS "Workspace delete leads" ON leads;
CREATE POLICY "ws_delete_leads" ON leads FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());

-- =========================
-- USERS — every workspace member can read the workspace roster.
-- (Sales Admin needs to see colleagues for assignment dropdowns; Super Admin
--  still uniquely retains UPDATE / DELETE via the policies below.)
-- =========================
DROP POLICY IF EXISTS "Workspace users readable by admin/manager" ON users;
CREATE POLICY "ws_select_users" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR workspace_id = get_current_workspace_id()
  );

DROP POLICY IF EXISTS "Admin updates workspace users; users update self" ON users;
CREATE POLICY "ws_update_users" ON users FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1)
  );

DROP POLICY IF EXISTS "Admin deletes workspace users" ON users;
CREATE POLICY "ws_delete_users" ON users FOR DELETE
  USING (workspace_id = get_current_workspace_id() AND get_current_user_role_id() = 1);

-- =========================
-- Generic sweep: every other ws_* policy on tenant tables that still has the
-- legacy "role_id IN (1, 2)" gate gets rewritten to pure workspace scoping.
-- Tables touched: segments, segment_rules, segment_members, campaigns,
-- campaign_templates, campaign_template_steps, ai_prompt_templates,
-- workflows, workflow_executions, sequences, sequence_steps,
-- newsletters, newsletter_recipients, email_templates,
-- blocklist, inbox_messages, lead_activities, user_permissions, notifications.
-- =========================
DO $$
DECLARE
  t TEXT;
  cmd TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'segments','segment_rules','segment_members',
    'campaigns','campaign_templates','campaign_template_steps','ai_prompt_templates',
    'workflows','workflow_executions','sequences','sequence_steps',
    'newsletters','newsletter_recipients','email_templates',
    'blocklist','inbox_messages','lead_activities','user_permissions'
  ])
  LOOP
    -- Drop any policy that still references "role_id IN (1, 2)" or owner_id-gates
    DECLARE p RECORD;
    BEGIN
      FOR p IN
        SELECT policyname FROM pg_policies WHERE tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', p.policyname, t);
      END LOOP;
    END;

    -- Recreate clean workspace-only policies
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());',
                   'ws_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());',
                   'ws_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());',
                   'ws_update_' || t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());',
                   'ws_delete_' || t, t);
  END LOOP;
END $$;

-- Notifications keep per-user scoping (each user only sees their own) but must
-- not leak across workspaces.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON notifications;', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "ws_select_notifications" ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());
CREATE POLICY "ws_insert_notifications" ON notifications FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY "ws_update_notifications" ON notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());
CREATE POLICY "ws_delete_notifications" ON notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND workspace_id = get_current_workspace_id());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0020_lead_contact_allow_linkedin.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- A social prospect often has only a LinkedIn / profile URL, no email or website.
-- Relax lead_contact_check so a linkedin URL also satisfies the "has contact" rule.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS lead_contact_check;
ALTER TABLE leads ADD CONSTRAINT lead_contact_check
  CHECK (email IS NOT NULL OR website_url IS NOT NULL OR linkedin IS NOT NULL);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0021_assistant_chats.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0022_opportunities.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Opportunities — the "to-Revenue" half of the Lead-to-Revenue flow.
-- A lead is converted into an opportunity, which then moves through a sales
-- pipeline (new → qualified → meeting_scheduled → proposal_sent → negotiation
-- → won / lost) and carries a deal value used for revenue reporting.
-- Reuses the workspace helpers + auto-fill trigger from 0012_workspaces.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  -- Denormalized snapshot of the lead at convert time (survives lead deletion)
  name VARCHAR(200) NOT NULL DEFAULT 'Untitled deal',
  company VARCHAR(200),
  contact_name VARCHAR(150),
  contact_email VARCHAR(255),
  deal_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- 'new' | 'qualified' | 'meeting_scheduled' | 'proposal_sent' | 'negotiation' | 'won' | 'lost'
  stage VARCHAR(30) NOT NULL DEFAULT 'new',
  expected_close_date DATE,
  notes TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Set automatically when stage moves to a closed state, for cycle-time reporting
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_workspace ON opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead ON opportunities(lead_id);

-- Auto-fill workspace_id on insert (same trigger fn as core tables) + RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['opportunities']) LOOP
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0023_fix_delete_constraints.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Fix delete-blocking foreign keys.
--
-- Several FKs were created with the default ON DELETE NO ACTION, so deleting a
-- parent row (a campaign, segment, template, lead, or user) fails with a 23503
-- error once any child row references it — e.g. deleting a campaign that has
-- inbox_messages. All these child columns are nullable, so we switch them to
-- ON DELETE SET NULL: the parent can be deleted and the child history is kept,
-- just unlinked.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- child table,          column,        constraint name,                      parent table,     parent col
      ('inbox_messages',       'campaign_id', 'inbox_messages_campaign_id_fkey',     'campaigns',      'id'),
      ('campaigns',            'segment_id',  'campaigns_segment_id_fkey',           'segments',       'id'),
      ('sequence_steps',       'template_id', 'sequence_steps_template_id_fkey',     'email_templates','id'),
      ('workflow_executions',  'lead_id',     'workflow_executions_lead_id_fkey',    'leads',          'id'),
      ('blocklist',            'added_by',    'blocklist_added_by_fkey',             'users',          'user_id'),
      ('campaigns',            'created_by',  'campaigns_created_by_fkey',           'users',          'user_id'),
      ('email_templates',      'created_by',  'email_templates_created_by_fkey',     'users',          'user_id'),
      ('leads',                'owner_id',    'leads_owner_id_fkey',                 'users',          'user_id'),
      ('segments',             'created_by',  'segments_created_by_fkey',            'users',          'user_id'),
      ('sequences',            'created_by',  'sequences_created_by_fkey',           'users',          'user_id'),
      ('user_permissions',     'assigned_by', 'user_permissions_assigned_by_fkey',   'users',          'user_id'),
      ('users',                'manager_id',  'users_manager_id_fkey',               'users',          'user_id'),
      ('workflows',            'created_by',  'workflows_created_by_fkey',           'users',          'user_id')
    ) AS t(child_table, child_col, conname, parent_table, parent_col)
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;', r.child_table, r.conname);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE SET NULL;',
      r.child_table, r.conname, r.child_col, r.parent_table, r.parent_col
    );
  END LOOP;
END $$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0024_campaign_jobs.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Campaign job queue — schedules multi-step campaign follow-ups.
--
-- When a campaign is launched, Step 1 sends immediately and Steps 2..N are
-- inserted here with a run_at = launch + their delay. The same per-minute cron
-- that drains outreach_jobs also drains these (see /api/outreach/cron), so the
-- timed follow-ups actually send — with the campaign's Brevo tag + inbox logging
-- intact (unlike the generic outreach processor).
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step_order INT NOT NULL DEFAULT 1,
  subject VARCHAR(255),
  body TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'pending' | 'sent' | 'failed' | 'skipped' | 'canceled'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_due ON campaign_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_campaign ON campaign_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_lead ON campaign_jobs(lead_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['campaign_jobs']) LOOP
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0025_campaign_jobs_channel.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Multichannel campaign steps — let a campaign sequence mix Email + LinkedIn.
-- Adds channel/action to the campaign job queue so the scheduler knows whether
-- a queued step is an email, a LinkedIn connection request, or a LinkedIn message.
-- ============================================================================

ALTER TABLE campaign_jobs ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'email';
-- 'email' | 'connection_request' | 'linkedin_message'
ALTER TABLE campaign_jobs ADD COLUMN IF NOT EXISTS action VARCHAR(40) NOT NULL DEFAULT 'email';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0026_outreach_accounts_ownership.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Connected accounts belong to ONE workspace.
--
-- There is a single shared Unipile API key for the whole app, so a naive sync
-- copied every connected account into every workspace that clicked "Recheck".
-- Fix: dedup leaked copies (keep the most-recent per account_id) and enforce a
-- GLOBAL unique constraint on account_id, so a workspace can never claim an
-- account already owned by another workspace.
-- ============================================================================

DELETE FROM outreach_accounts
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY account_id ORDER BY created_at DESC, id DESC) AS rn
    FROM outreach_accounts
    WHERE account_id IS NOT NULL
  ) t WHERE rn > 1
);

ALTER TABLE outreach_accounts DROP CONSTRAINT IF EXISTS outreach_accounts_account_id_key;
ALTER TABLE outreach_accounts ADD CONSTRAINT outreach_accounts_account_id_key UNIQUE (account_id);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0027_lead_ai_score.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Persist the full AI prospect-score breakdown (overall, dimensions, insight,
-- next steps) so it survives reloads instead of living only in component state.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_score JSONB;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0028_onboarding.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Onboarding — company & sales "essentials" captured right after signup.
-- Stored on the workspace (one setup per team). `onboarding_completed` gates
-- access to the app until the wizard is finished.
-- workspaces already has RLS (owner can update); no new policies needed.
-- ============================================================================

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding JSONB DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0029_subscriptions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 0028_subscriptions.sql
-- Subscription plans, per-workspace subscriptions, credit
-- ledger, top-up packs.  Chargebee is the billing engine
-- (Stripe connected inside Chargebee as the payment gateway).
-- ============================================================

-- ── 1. Plan definitions (static reference) ──────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                    TEXT PRIMARY KEY,   -- 'basic' | 'starter' | 'pro'
  name                  TEXT NOT NULL,
  monthly_price_cents   INTEGER NOT NULL,
  annual_price_cents    INTEGER NOT NULL,   -- full year price, already discounted
  credits_per_cycle     INTEGER NOT NULL,
  trial_days            INTEGER NOT NULL DEFAULT 0,
  features              JSONB NOT NULL DEFAULT '{}',
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Seed plan rows (idempotent)
INSERT INTO subscription_plans
  (id, name, monthly_price_cents, annual_price_cents, credits_per_cycle, trial_days, features, sort_order)
VALUES
  ('basic',   'Basic',    899,   8990,    150,  7,
   '{"discovery":false,"reply_tracking":false,"csv_import":true,"enrichment":false,"scoring":false,"linkedin_outreach":false,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":false,"meetings":false}',
   1),
  ('starter', 'Starter',  5900,  59000,  1000,  0,
   '{"discovery":true,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":false,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":false}',
   2),
  ('pro',     'Pro',     13900, 139000,  2500,  0,
   '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}',
   3)
ON CONFLICT (id) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  credits_per_cycle   = EXCLUDED.credits_per_cycle,
  trial_days          = EXCLUDED.trial_days,
  features            = EXCLUDED.features;

-- ── 2. Subscriptions (one per workspace) ────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id                  TEXT    NOT NULL REFERENCES subscription_plans(id) DEFAULT 'basic',
  billing_interval         TEXT    NOT NULL DEFAULT 'monthly'
                             CHECK (billing_interval IN ('monthly','annual')),
  status                   TEXT    NOT NULL DEFAULT 'trialing'
                             CHECK (status IN ('trialing','active','past_due','canceled')),
  trial_ends_at            TIMESTAMPTZ,
  current_period_start     TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  credits_remaining        INTEGER NOT NULL DEFAULT 150  CHECK (credits_remaining >= 0),
  credits_total            INTEGER NOT NULL DEFAULT 150,
  low_balance_notified_at  TIMESTAMPTZ,
  -- Chargebee / Stripe references
  chargebee_customer_id      TEXT,
  chargebee_subscription_id  TEXT UNIQUE,
  chargebee_plan_id          TEXT,   -- e.g. 'starter-monthly-USD'
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id)
);

-- ── 3. Credit ledger (immutable audit log) ───────────────────
CREATE TABLE IF NOT EXISTS credit_ledger (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscription_id  UUID    REFERENCES subscriptions(id),
  operation_type   TEXT    NOT NULL,
  -- 'enrichment'|'scoring'|'content_analysis'|'discovery'
  -- 'top_up'|'cycle_reset'|'trial_grant'|'plan_change'
  credits_delta    INTEGER NOT NULL,  -- negative = consumed, positive = granted
  lead_id          UUID,
  campaign_id      UUID,
  status           TEXT    NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('completed','failed','refunded')),
  metadata         JSONB   DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_workspace_idx
  ON credit_ledger (workspace_id, created_at DESC);

-- ── 4. Top-up packs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_top_ups (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credits                     INTEGER NOT NULL,
  price_cents                 INTEGER NOT NULL,
  expires_at                  TIMESTAMPTZ,
  chargebee_invoice_id        TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now()
);

-- ── 5. updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 6. Auto-create subscription on new workspace ─────────────
CREATE OR REPLACE FUNCTION create_workspace_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    trial_ends_at, current_period_start, current_period_end,
    credits_remaining, credits_total
  ) VALUES (
    NEW.id, 'basic', 'monthly', 'trialing',
    now() + INTERVAL '7 days',
    now(),
    now() + INTERVAL '7 days',
    150, 150
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 150, 'completed', '{"note":"7-day Basic trial"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created_subscription ON workspaces;
CREATE TRIGGER on_workspace_created_subscription
  AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION create_workspace_subscription();

-- Backfill existing workspaces
INSERT INTO subscriptions (
  workspace_id, plan_id, billing_interval, status,
  current_period_start, current_period_end,
  credits_remaining, credits_total
)
SELECT w.id, 'basic', 'monthly', 'active',
       now(), now() + INTERVAL '30 days', 150, 150
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.workspace_id = w.id
)
ON CONFLICT (workspace_id) DO NOTHING;

-- ── 7. Atomic credit deduction (SECURITY DEFINER) ────────────
CREATE OR REPLACE FUNCTION deduct_credits(
  p_workspace_id    UUID,
  p_operation_type  TEXT,
  p_amount          INTEGER DEFAULT 1,
  p_lead_id         UUID    DEFAULT NULL,
  p_campaign_id     UUID    DEFAULT NULL,
  p_metadata        JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_bal  INTEGER;
BEGIN
  SELECT * INTO v_sub
  FROM subscriptions WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.status = 'trialing'
     AND v_sub.trial_ends_at IS NOT NULL
     AND v_sub.trial_ends_at < now() THEN
    UPDATE subscriptions SET status = 'canceled', updated_at = now()
    WHERE id = v_sub.id;
    RETURN jsonb_build_object('ok', false, 'error', 'Trial expired');
  END IF;

  IF v_sub.credits_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient credits',
                              'remaining', v_sub.credits_remaining);
  END IF;

  v_bal := v_sub.credits_remaining - p_amount;

  UPDATE subscriptions
  SET credits_remaining = v_bal, updated_at = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta,
     lead_id, campaign_id, status, metadata)
  VALUES
    (p_workspace_id, v_sub.id, p_operation_type, -p_amount,
     p_lead_id, p_campaign_id, 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_bal, 'deducted', p_amount);
END;
$$;

-- ── 8. Cycle reset (called by Chargebee webhook) ─────────────
CREATE OR REPLACE FUNCTION reset_subscription_cycle(p_workspace_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub  FROM subscriptions      WHERE workspace_id = p_workspace_id FOR UPDATE;
  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining       = v_plan.credits_per_cycle,
    credits_total           = v_plan.credits_per_cycle,
    current_period_start    = now(),
    current_period_end      = CASE
                                WHEN v_sub.billing_interval = 'annual'
                                THEN now() + INTERVAL '1 year'
                                ELSE now() + INTERVAL '30 days'
                              END,
    low_balance_notified_at = NULL,
    status                  = 'active',
    updated_at              = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger
    (workspace_id, subscription_id, operation_type, credits_delta, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle,
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));
END;
$$;

-- ── 9. RLS ───────────────────────────────────────────────────
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_top_ups     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_read"              ON subscription_plans;
DROP POLICY IF EXISTS "subscriptions_workspace_read"   ON subscriptions;
DROP POLICY IF EXISTS "credit_ledger_workspace_read"   ON credit_ledger;
DROP POLICY IF EXISTS "credit_top_ups_workspace_read"  ON credit_top_ups;

CREATE POLICY "plans_public_read"
  ON subscription_plans FOR SELECT USING (true);

CREATE POLICY "subscriptions_workspace_read"
  ON subscriptions FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

CREATE POLICY "credit_ledger_workspace_read"
  ON credit_ledger FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

CREATE POLICY "credit_top_ups_workspace_read"
  ON credit_top_ups FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0030_calendar_accounts.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- LP-3 — Calendar connections. Stores per-workspace OAuth tokens for Google
-- Calendar and Microsoft (Graph) so we can read the user's free/busy and sync
-- availability automatically. Workspace-scoped via get_current_workspace_id()
-- and the set_workspace_from_user() trigger, matching outreach_accounts (0017).
--
-- Tokens are sensitive: rows are RLS-scoped to the owning workspace, and the
-- app reads token columns only server-side. The UI lists provider/email/status.
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  email            TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scope            TEXT,
  status           TEXT NOT NULL DEFAULT 'connected',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, email)
);

CREATE INDEX IF NOT EXISTS calendar_accounts_workspace_idx ON calendar_accounts(workspace_id);

-- Auto-populate workspace_id on insert + workspace-scoped RLS (same helpers 0017 uses).
DROP TRIGGER IF EXISTS auto_workspace_trigger ON calendar_accounts;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON calendar_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE calendar_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_calendar_accounts ON calendar_accounts;
DROP POLICY IF EXISTS ws_insert_calendar_accounts ON calendar_accounts;
DROP POLICY IF EXISTS ws_update_calendar_accounts ON calendar_accounts;
DROP POLICY IF EXISTS ws_delete_calendar_accounts ON calendar_accounts;
CREATE POLICY ws_select_calendar_accounts ON calendar_accounts FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_calendar_accounts ON calendar_accounts FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_calendar_accounts ON calendar_accounts FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_calendar_accounts ON calendar_accounts FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0031_meetings.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0032_campaign_sequence_settings.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Campaign builder settings surfaced in the redesigned Sequence tab:
--   - content_is_html: the step bodies are rich-text (HTML) rather than plain
--     text, so the sender knows to render/send them as HTML.
--   - pause_same_company_on_reply: when a lead replies, also pause remaining
--     steps for OTHER leads at the same email domain (not just that lead).
-- ============================================================================

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_is_html BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pause_same_company_on_reply BOOLEAN NOT NULL DEFAULT false;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0033_campaign_approval_lifecycle.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Content approval lifecycle for campaigns — a second, independent status
-- track alongside the existing operational `status` (Draft/Active/Paused/
-- Scheduled). `approval_status` gates whether a campaign may be launched at
-- all: Draft (AI-generated) -> Pending review -> Approved -> Live/Distributing
-- -> Archived. campaign_approval_log is an append-only audit trail of every
-- transition (who, when, optional comment).
-- ============================================================================

-- New workspace role: the only role (besides Super Admin) allowed to approve
-- or send back a Pending review campaign.
INSERT INTO roles (role_name, role_description)
SELECT 'Reviewer', 'Can approve or send back AI-generated campaign content before it goes live.'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE role_name = 'Reviewer');

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) NOT NULL DEFAULT 'Draft (AI-generated)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_approval_status_check'
  ) THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_approval_status_check
      CHECK (approval_status IN ('Draft (AI-generated)', 'Pending review', 'Approved', 'Live/Distributing', 'Archived'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS campaign_approval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  changed_by UUID REFERENCES users(user_id), -- NULL = System (e.g. auto-archive)
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_approval_log_campaign ON campaign_approval_log(campaign_id, created_at);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['campaign_approval_log']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_select_%s ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS ws_insert_%s ON %I;', t, t);
    EXECUTE format('CREATE POLICY ws_select_%s ON %I FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());', t, t);
    EXECUTE format('CREATE POLICY ws_insert_%s ON %I FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());', t, t);
  END LOOP;
END $$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0034_backfill_campaign_approval_status.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Backfill approval_status for campaigns that were already sending before the
-- content-approval lifecycle (migration 0033) existed. Those rows got the
-- column's default 'Draft (AI-generated)' even though they were genuinely
-- already Active/Paused with real sends — misleadingly showing "Draft" in the
-- list while their detail page correctly showed "Active".
-- ============================================================================

UPDATE campaigns
SET approval_status = 'Live/Distributing'
WHERE approval_status = 'Draft (AI-generated)'
  AND (status IN ('Active', 'Paused') OR sent_count > 0);


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0035_defer_trial_until_card.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Card-first, then trial: a brand-new workspace should have NO subscription
-- row until a payment method has actually been added (via Chargebee checkout).
-- Previously, on_workspace_created_subscription auto-granted a 7-day Basic
-- trial with 150 credits the instant a workspace was created — no card
-- required. That's being replaced by a dashboard-level gate (in the app) that
-- routes an unsubscribed user into Chargebee checkout, whose Basic Monthly
-- item price already has its own native 7-day trial configured — so
-- completing that checkout is what starts the trial now, not signup.
--
-- getSubscription() already returns null gracefully when no row exists, so
-- no application code depends on a subscription row always being present.
-- ============================================================================

DROP TRIGGER IF EXISTS on_workspace_created_subscription ON workspaces;
DROP FUNCTION IF EXISTS create_workspace_subscription();


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0036_gate_opportunities_meetings.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Add two new plan features: "opportunities" and "meetings", both Pro-only —
-- per product decision, these pages weren't gated by plan before at all.
-- Merged into the existing features JSONB rather than overwriting it.
-- ============================================================================

UPDATE subscription_plans
SET features = features || '{"opportunities": false, "meetings": false}'::jsonb
WHERE id IN ('basic', 'starter');

UPDATE subscription_plans
SET features = features || '{"opportunities": true, "meetings": true}'::jsonb
WHERE id = 'pro';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0037_notifications_delete_policy.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Notifications: allow users to delete their own notifications (Clear all)
-- ============================================================================

DROP POLICY IF EXISTS "Delete own notifications" ON notifications;
CREATE POLICY "Delete own notifications" ON notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0057_user_nav_access.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Per-user nav permission overrides on top of role defaults.
-- Shape: { "/leads": true, "/newsletters": false }
-- A present key overrides the role default for that nav item.
-- A missing key falls back to whatever the user's role normally allows.

ALTER TABLE users ADD COLUMN IF NOT EXISTS nav_access JSONB DEFAULT '{}'::jsonb;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0038_reprice.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 0038_reprice.sql
-- Reprices all three subscription plans to market rate.
-- Basic $19/mo, Starter $89/mo, Pro $159/mo (20% annual discount).
-- Credits: Basic 500, Starter 3,000, Pro 8,000.
-- LinkedIn outreach unlocked at Starter tier (was Pro-only).
-- ============================================================

-- ── 1. Update plan prices, credits, and feature flags ───────
INSERT INTO subscription_plans
  (id, name, monthly_price_cents, annual_price_cents, credits_per_cycle, trial_days, features, sort_order)
VALUES
  ('basic', 'Basic', 1900, 18240, 500, 7,
   '{"discovery":false,"reply_tracking":false,"csv_import":true,"enrichment":false,"scoring":false,"linkedin_outreach":false,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":false,"meetings":false}',
   1),
  ('starter', 'Starter', 8900, 85440, 3000, 0,
   '{"discovery":true,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":false}',
   2),
  ('pro', 'Pro', 15900, 152640, 8000, 0,
   '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}',
   3)
ON CONFLICT (id) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  credits_per_cycle   = EXCLUDED.credits_per_cycle,
  trial_days          = EXCLUDED.trial_days,
  features            = EXCLUDED.features;

-- ── 2. Update the workspace subscription trigger ─────────────
-- Patch create_workspace_subscription to grant 500 trial credits
-- instead of the old hardcoded 150.
CREATE OR REPLACE FUNCTION create_workspace_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    trial_ends_at, current_period_start, current_period_end,
    credits_remaining, credits_total
  ) VALUES (
    NEW.id, 'basic', 'monthly', 'trialing',
    now() + INTERVAL '7 days',
    now(),
    now() + INTERVAL '7 days',
    500, 500
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 500, 'completed', '{"note":"7-day Basic trial"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;

-- ── 3. Update existing Basic trial subscriptions ─────────────
-- Bump credits_total (and remaining if not yet used) for any
-- workspace currently on the Basic trial with the old 150 allocation.
UPDATE subscriptions
SET
  credits_total     = 500,
  credits_remaining = LEAST(credits_remaining + (500 - credits_total), 500)
WHERE
  plan_id = 'basic'
  AND status = 'trialing'
  AND credits_total = 150;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0059_audit_log.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Audit log — durable "who did what" trail across the app (campaigns, leads,
-- buy-leads, segments, templates, newsletters, connectors, users/roles, etc.),
-- viewable by Super Admin only. Insert-only: no UPDATE/DELETE policy exists for
-- any role, so entries can't be altered or wiped once written (even by admins,
-- via the app) — unlike `notifications`, which users can delete themselves.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name     TEXT,
  action         TEXT NOT NULL,        -- e.g. "campaign.created", "leads.bought", "segment.deleted"
  entity_type    TEXT,                 -- e.g. "campaign", "lead", "segment"
  entity_id      UUID,
  entity_label   TEXT,                 -- human-readable name, e.g. the campaign's name
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON audit_log(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON audit_log;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may log an entry (scoped to their own workspace) —
-- defense-in-depth only; the app writes via the admin client in practice.
DROP POLICY IF EXISTS ws_insert_audit_log ON audit_log;
CREATE POLICY ws_insert_audit_log ON audit_log FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

-- Only a Super Admin can read the log, scoped to their own workspace.
DROP POLICY IF EXISTS admin_select_audit_log ON audit_log;
CREATE POLICY admin_select_audit_log ON audit_log FOR SELECT TO authenticated
  USING (get_current_user_role_id() = 1 AND workspace_id = get_current_workspace_id());

-- Deliberately no UPDATE or DELETE policy — the log is immutable at the DB level.
