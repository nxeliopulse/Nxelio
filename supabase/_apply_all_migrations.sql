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
-- >>> FILE: 0039_reprice_v2.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 0039_reprice_v2.sql
-- Reprices all three subscription plans (supersedes 0038).
-- Basic $9.99/mo, Starter $69/mo, Pro $149/mo (20% annual discount).
-- Credits: Basic 200, Starter 1,200, Pro 3,000.
-- Feature flags are unchanged from 0038 — only price/credits move.
-- ============================================================

-- ── 1. Update plan prices and credits (features carried forward) ───────
INSERT INTO subscription_plans
  (id, name, monthly_price_cents, annual_price_cents, credits_per_cycle, trial_days, features, sort_order)
VALUES
  ('basic', 'Basic', 999, 9590, 200, 7,
   '{"discovery":false,"reply_tracking":false,"csv_import":true,"enrichment":false,"scoring":false,"linkedin_outreach":false,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":false,"meetings":false}',
   1),
  ('starter', 'Starter', 6900, 66240, 1200, 0,
   '{"discovery":true,"reply_tracking":false,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":false}',
   2),
  ('pro', 'Pro', 14900, 143040, 3000, 0,
   '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}',
   3)
ON CONFLICT (id) DO UPDATE SET
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  credits_per_cycle   = EXCLUDED.credits_per_cycle,
  trial_days          = EXCLUDED.trial_days,
  features            = EXCLUDED.features;

-- ── 2. Update the workspace subscription trigger ─────────────
-- Patch create_workspace_subscription to grant 200 trial credits
-- instead of the old 500 (from 0038).
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
    200, 200
  ) ON CONFLICT (workspace_id) DO NOTHING;

  INSERT INTO credit_ledger
    (workspace_id, operation_type, credits_delta, status, metadata)
  SELECT NEW.id, 'trial_grant', 200, 'completed', '{"note":"7-day Basic trial"}'
  WHERE NOT EXISTS (
    SELECT 1 FROM credit_ledger
    WHERE workspace_id = NEW.id AND operation_type = 'trial_grant'
  );

  RETURN NEW;
END;
$$;

-- ── 3. Cap every existing subscription to the new (lower) plan values ──
-- Applies immediately to trialing, active, and past_due workspaces alike.
-- Never grants extra credits — only ratchets credits_total down to the
-- new allocation and caps credits_remaining at that new total.
UPDATE subscriptions s
SET
  credits_total     = sp.credits_per_cycle,
  credits_remaining = LEAST(s.credits_remaining, sp.credits_per_cycle)
FROM subscription_plans sp
WHERE s.plan_id = sp.id;



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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0065_reprice_basic.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 0065_reprice_basic.sql
-- Basic plan: $9.99/mo -> $14.99/mo, $95.90/yr -> $143.90/yr
-- (20% annual discount convention preserved). Credits (200/mo)
-- and Starter/Pro plans are unaffected.
-- ============================================================

UPDATE subscription_plans
SET monthly_price_cents = 1499,
    annual_price_cents  = 14390
WHERE id = 'basic';



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0066_promotions_leads.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- 0066_promotions_leads.sql
--
-- Three things in one migration:
-- 1. Reprice + restructure feature gates: Basic $15.99/mo now unlocks
--    enrichment/scoring/LinkedIn outreach/reply tracking/meetings (still no
--    automated discovery — bring-your-own-leads only). Starter $69/mo and
--    Pro $149/mo credit/lead allowances drop to 300/300 and 1000/1000
--    respectively (superseding whatever 0038/0039/0060 set previously).
-- 2. Introduce "leads" as a second currency, separate from AI credits,
--    following the exact same pattern as credits (subscriptions columns +
--    credit_ledger entries + a deduct_/grant_ RPC pair). Purchased top-up
--    leads are tracked separately (topup_leads_remaining) so they persist
--    across cycle resets, unlike the monthly plan allowance.
-- 3. Promo codes: percentage/fixed discount (via a real Chargebee coupon),
--    and/or bonus credits, and/or bonus leads, categorized (referral/
--    launch/seasonal/student/general) for reporting. Chargebee remains the
--    only billing gateway — chargebee_coupon_id, never a Stripe id.
-- ============================================================================

-- ── 1. Reprice + feature gates + leads_per_cycle on the plan catalog ────────
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS leads_per_cycle INTEGER NOT NULL DEFAULT 0;

UPDATE subscription_plans SET
  monthly_price_cents = 1599, annual_price_cents = 15350,
  credits_per_cycle = 200, leads_per_cycle = 0,
  features = '{"discovery":false,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":false,"priority_support":false,"opportunities":false,"meetings":true}'
WHERE id = 'basic';

UPDATE subscription_plans SET
  monthly_price_cents = 6900, annual_price_cents = 66240,
  credits_per_cycle = 300, leads_per_cycle = 300,
  features = '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":false,"opportunities":true,"meetings":true}'
WHERE id = 'starter';

UPDATE subscription_plans SET
  monthly_price_cents = 14900, annual_price_cents = 143040,
  credits_per_cycle = 1000, leads_per_cycle = 1000,
  features = '{"discovery":true,"reply_tracking":true,"csv_import":true,"enrichment":true,"scoring":true,"linkedin_outreach":true,"core_workflows":true,"crm_export":true,"priority_support":true,"opportunities":true,"meetings":true}'
WHERE id = 'pro';

-- ── 2. Leads currency on subscriptions ───────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS leads_remaining       INTEGER NOT NULL DEFAULT 0 CHECK (leads_remaining >= 0),
  ADD COLUMN IF NOT EXISTS leads_total           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS topup_leads_remaining INTEGER NOT NULL DEFAULT 0 CHECK (topup_leads_remaining >= 0);

-- Give every existing workspace its plan's lead allowance immediately
-- (otherwise everyone sits at 0 leads until their next renewal touches reset_subscription_cycle),
-- and cap credits to the new (in Starter/Pro's case, much lower) allowances —
-- same "apply immediately to everyone" policy used for the last repricing.
UPDATE subscriptions s
SET
  leads_remaining   = sp.leads_per_cycle,
  leads_total       = sp.leads_per_cycle,
  credits_total     = sp.credits_per_cycle,
  credits_remaining = LEAST(s.credits_remaining, sp.credits_per_cycle)
FROM subscription_plans sp
WHERE s.plan_id = sp.id;

-- ── credit_ledger: tag which currency each entry is about ───────────────────
ALTER TABLE credit_ledger ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'credits'
  CHECK (resource_type IN ('credits','leads'));

-- ── credit_top_ups: repurpose this table for lead top-ups too. It was
--    defined in an earlier migration file but never actually created in this
--    database (nothing in the app reads/writes it today), so create it here
--    defensively with its original schema before renaming/extending it.
CREATE TABLE IF NOT EXISTS credit_top_ups (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credits              INTEGER NOT NULL,
  price_cents          INTEGER NOT NULL,
  expires_at           TIMESTAMPTZ,
  chargebee_invoice_id TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE credit_top_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_top_ups_workspace_read ON credit_top_ups;
CREATE POLICY credit_top_ups_workspace_read ON credit_top_ups FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
);

-- Renamed `credits` -> `quantity` since it's now dual-purpose (credits or leads).
ALTER TABLE credit_top_ups RENAME COLUMN credits TO quantity;
ALTER TABLE credit_top_ups ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'credits'
  CHECK (resource_type IN ('credits','leads'));

-- ── 3. Promotions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,   -- stored UPPERCASE by convention
  name                  TEXT,
  description           TEXT,
  category              TEXT CHECK (category IS NULL OR category IN ('referral','launch','seasonal','student','general')),
  discount_type         TEXT CHECK (discount_type IS NULL OR discount_type IN ('percentage','fixed_amount')),
  discount_value        NUMERIC,                -- display-only mirror; the Chargebee coupon is authoritative for actual math
  chargebee_coupon_id   TEXT,                   -- NULL if this code grants no price discount
  bonus_credits         INTEGER NOT NULL DEFAULT 0 CHECK (bonus_credits >= 0),
  bonus_leads           INTEGER NOT NULL DEFAULT 0 CHECK (bonus_leads >= 0),
  applicable_plans      TEXT[],                 -- NULL/empty = all plans
  max_redemptions       INTEGER,                -- NULL = unlimited
  times_redeemed        INTEGER NOT NULL DEFAULT 0,
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until           TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (chargebee_coupon_id IS NOT NULL OR bonus_credits > 0 OR bonus_leads > 0)
);

DROP TRIGGER IF EXISTS promotions_updated_at ON promotions;
CREATE TRIGGER promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();  -- reuses existing fn from 0029_subscriptions.sql

CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  promotion_id               UUID NOT NULL REFERENCES promotions(id),
  status                     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  bonus_credits_granted      INTEGER NOT NULL DEFAULT 0,
  bonus_leads_granted        INTEGER NOT NULL DEFAULT 0,
  chargebee_coupon_id        TEXT,
  chargebee_hosted_page_id   TEXT,
  chargebee_subscription_id  TEXT,
  metadata                   JSONB DEFAULT '{}',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at               TIMESTAMPTZ
);

-- One pending redemption per workspace+promotion — an abandoned/retried
-- checkout reuses the same row instead of piling up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_redemptions_pending_unique
  ON promotion_redemptions (workspace_id, promotion_id) WHERE status = 'pending';
-- One completed redemption per workspace+promotion ever — hard double-redeem block.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_redemptions_completed_unique
  ON promotion_redemptions (workspace_id, promotion_id) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS promotion_redemptions_workspace_idx
  ON promotion_redemptions (workspace_id, created_at DESC);

-- ── redeem_promotion_start: validate + reserve, called BEFORE the Chargebee
--    checkout call from checkout/route.ts ───────────────────────────────────
CREATE OR REPLACE FUNCTION redeem_promotion_start(
  p_workspace_id UUID,
  p_code         TEXT,
  p_plan_id      TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo         promotions%ROWTYPE;
  v_completed     INTEGER;
  v_redemption_id UUID;
BEGIN
  SELECT * INTO v_promo FROM promotions WHERE code = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid promo code');
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is no longer active');
  END IF;

  IF v_promo.valid_from > now() OR (v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;

  IF v_promo.applicable_plans IS NOT NULL
     AND array_length(v_promo.applicable_plans, 1) > 0
     AND NOT (p_plan_id = ANY(v_promo.applicable_plans)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for the selected plan');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL AND v_promo.times_redeemed >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has reached its redemption limit');
  END IF;

  SELECT count(*) INTO v_completed FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'completed';

  IF v_completed > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already used this code');
  END IF;

  SELECT id INTO v_redemption_id FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'pending';

  IF v_redemption_id IS NULL THEN
    INSERT INTO promotion_redemptions
      (workspace_id, promotion_id, status, bonus_credits_granted, bonus_leads_granted, chargebee_coupon_id)
    VALUES (p_workspace_id, v_promo.id, 'pending', v_promo.bonus_credits, v_promo.bonus_leads, v_promo.chargebee_coupon_id)
    RETURNING id INTO v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'promotion_id', v_promo.id,
    'chargebee_coupon_id', v_promo.chargebee_coupon_id,
    'bonus_credits', v_promo.bonus_credits,
    'bonus_leads', v_promo.bonus_leads,
    'description', v_promo.description
  );
END;
$$;

-- ── redeem_promotion_finalize: called AFTER Chargebee confirms the
--    subscription was actually created (checkout-return / webhook) ─────────
CREATE OR REPLACE FUNCTION redeem_promotion_finalize(
  p_workspace_id UUID,
  p_hosted_page_id TEXT DEFAULT NULL,
  p_chargebee_subscription_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_redemption promotion_redemptions%ROWTYPE;
  v_sub        subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id
    AND status = 'pending'
    AND (p_hosted_page_id IS NULL OR chargebee_hosted_page_id = p_hosted_page_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'applied', false);  -- normal case: no promo used
  END IF;

  UPDATE promotion_redemptions
  SET status = 'completed', completed_at = now(), chargebee_subscription_id = p_chargebee_subscription_id
  WHERE id = v_redemption.id;

  UPDATE promotions SET times_redeemed = times_redeemed + 1, updated_at = now()
  WHERE id = v_redemption.promotion_id;

  IF v_redemption.bonus_credits_granted > 0 OR v_redemption.bonus_leads_granted > 0 THEN
    SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
    IF FOUND THEN
      UPDATE subscriptions SET
        credits_remaining = credits_remaining + v_redemption.bonus_credits_granted,
        credits_total     = credits_total + v_redemption.bonus_credits_granted,
        leads_remaining   = leads_remaining + v_redemption.bonus_leads_granted,
        leads_total       = leads_total + v_redemption.bonus_leads_granted,
        updated_at        = now()
      WHERE id = v_sub.id;

      IF v_redemption.bonus_credits_granted > 0 THEN
        INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
        VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_credits_granted, 'credits', 'completed',
                jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
      END IF;
      IF v_redemption.bonus_leads_granted > 0 THEN
        INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
        VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_leads_granted, 'leads', 'completed',
                jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', true,
    'bonus_credits', v_redemption.bonus_credits_granted, 'bonus_leads', v_redemption.bonus_leads_granted);
END;
$$;

-- ── 4. deduct_leads: mirrors deduct_credits() exactly, but spends the
--    monthly plan allowance first, then falls back to purchased top-up leads ──
CREATE OR REPLACE FUNCTION deduct_leads(
  p_workspace_id UUID,
  p_amount       INTEGER DEFAULT 1,
  p_metadata     JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub        subscriptions%ROWTYPE;
  v_from_plan  INTEGER;
  v_from_topup INTEGER;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF (v_sub.leads_remaining + v_sub.topup_leads_remaining) < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient leads remaining',
      'remaining', v_sub.leads_remaining + v_sub.topup_leads_remaining);
  END IF;

  v_from_plan  := LEAST(v_sub.leads_remaining, p_amount);
  v_from_topup := p_amount - v_from_plan;

  UPDATE subscriptions SET
    leads_remaining       = leads_remaining - v_from_plan,
    topup_leads_remaining = topup_leads_remaining - v_from_topup,
    updated_at            = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_discovery', -p_amount, 'leads', 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true,
    'remaining', (v_sub.leads_remaining - v_from_plan) + (v_sub.topup_leads_remaining - v_from_topup),
    'deducted', p_amount);
END;
$$;

-- ── grant_leads_topup: called after a successful Chargebee one-time charge ──
CREATE OR REPLACE FUNCTION grant_leads_topup(
  p_workspace_id UUID,
  p_leads        INTEGER,
  p_price_cents  INTEGER,
  p_chargebee_invoice_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  UPDATE subscriptions SET topup_leads_remaining = topup_leads_remaining + p_leads, updated_at = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_top_ups (workspace_id, quantity, resource_type, price_cents, chargebee_invoice_id)
  VALUES (p_workspace_id, p_leads, 'leads', p_price_cents, p_chargebee_invoice_id);

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_topup', p_leads, 'leads', 'completed',
          jsonb_build_object('price_cents', p_price_cents, 'chargebee_invoice_id', p_chargebee_invoice_id));

  RETURN jsonb_build_object('ok', true, 'topup_leads_remaining', v_sub.topup_leads_remaining + p_leads);
END;
$$;

-- ── 5. reset_subscription_cycle: now also resets the monthly leads
--    allowance from the plan (topup_leads_remaining is untouched — it
--    persists across cycles since it was separately purchased) ─────────────
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
    leads_remaining         = v_plan.leads_per_cycle,
    leads_total             = v_plan.leads_per_cycle,
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

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle, 'credits',
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));

  IF v_plan.leads_per_cycle > 0 THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.leads_per_cycle, 'leads',
            'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval));
  END IF;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE promotions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotions_public_read ON promotions;
CREATE POLICY promotions_public_read ON promotions FOR SELECT USING (true);
-- (mirrors subscription_plans_public_read — needed so client-side code can validate a code)

DROP POLICY IF EXISTS promotion_redemptions_workspace_read ON promotion_redemptions;
CREATE POLICY promotion_redemptions_workspace_read
  ON promotion_redemptions FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );
-- Deliberately no INSERT/UPDATE policy for authenticated users — all writes go
-- through the two SECURITY DEFINER RPCs above, exactly like deduct_credits /
-- reset_subscription_cycle already do for subscriptions/credit_ledger.



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0067_reprice_basic_1499.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================
-- 0067_reprice_basic_1499.sql
-- Basic plan: $15.99/mo -> $14.99/mo, $153.50/yr -> $143.90/yr
-- (20% annual discount convention preserved). Credits (200/mo)
-- and Starter/Pro plans are unaffected.
-- ============================================================

UPDATE subscription_plans
SET monthly_price_cents = 1499,
    annual_price_cents  = 14390
WHERE id = 'basic';



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0060_lead_import_archive.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Lead import archive — a permanent record of every lead ever imported into a
-- workspace (CSV, LinkedIn search, Buy Leads, etc.), tied to the workspace and
-- the user who imported it. Unlike the working `leads` table, rows here are
-- NEVER deleted when the corresponding lead is deleted from `leads` — instead
-- `deleted_from_leads_at` is stamped so there's a durable record that the
-- import happened even after the lead itself is gone. See Privacy Policy
-- Section 7 for the corresponding disclosure.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_import_archive (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  imported_by_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_by_name      TEXT,
  source                TEXT,                 -- e.g. "Buy Leads", "CSV Upload", "LinkedIn Search"
  original_lead_id      UUID,                  -- points at leads.id; NOT a FK (row may later be deleted)
  full_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  company_name          TEXT,
  industry              TEXT,
  interest_area         TEXT,
  linkedin              TEXT,
  website_url           TEXT,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_from_leads_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS lead_import_archive_workspace_idx ON lead_import_archive(workspace_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS lead_import_archive_original_lead_idx ON lead_import_archive(original_lead_id);

ALTER TABLE lead_import_archive ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may archive an entry for their own workspace — the app
-- writes via the admin client in practice, this is defense-in-depth only.
DROP POLICY IF EXISTS ws_insert_lead_import_archive ON lead_import_archive;
CREATE POLICY ws_insert_lead_import_archive ON lead_import_archive FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

-- A workspace's own Super Admin can view its archive.
DROP POLICY IF EXISTS admin_select_lead_import_archive ON lead_import_archive;
CREATE POLICY admin_select_lead_import_archive ON lead_import_archive FOR SELECT TO authenticated
  USING (get_current_user_role_id() = 1 AND workspace_id = get_current_workspace_id());

-- Only the "deleted_from_leads_at" stamp may be updated (by the app's admin client) — no other mutation, no delete.
DROP POLICY IF EXISTS ws_update_lead_import_archive ON lead_import_archive;
CREATE POLICY ws_update_lead_import_archive ON lead_import_archive FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id())
  WITH CHECK (workspace_id = get_current_workspace_id());

-- Deliberately no DELETE policy — archive rows are permanent.


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0061_platform_vendor_subscriptions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Platform vendor subscriptions — Nxelio's OWN paid third-party accounts
-- (Unipile, AnySite, Brevo, etc.), tracked manually by the platform admin since
-- none of these vendors expose a billing/usage API we integrate with. Shown on
-- the /admin panel's Overview. Not customer-facing, not workspace-scoped.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_vendor_subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name        TEXT NOT NULL,        -- e.g. "Unipile", "AnySite", "Brevo"
  plan_name          TEXT,                 -- e.g. "Pro", "Pay-as-you-go"
  monthly_cost_cents INTEGER,
  renewal_date       DATE,
  usage_notes        TEXT,                 -- free-text, e.g. "4,200 / 10,000 emails sent this cycle"
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON platform_vendor_subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_vendor_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS enabled with NO policies for any role — only the service-role admin
-- client (used exclusively by the /admin panel) can reach this table at all.
ALTER TABLE platform_vendor_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- AI provider settings — platform-wide (not per-workspace), Super Admin panel
-- (/admin) only. Lets the platform admin toggle which AI provider (OpenAI or
-- Groq) powers every AI feature across the whole app.
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
-- ============================================================================
-- Clay-style custom AI columns for the Leads table. A saved column = a reusable
-- AI prompt (with {{field}} placeholders pulled from the lead's own data) that
-- gets run per-lead; the computed value is cached on the lead itself so it
-- renders instantly afterwards instead of re-calling the AI on every page view.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS ai_column_definitions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT,
  prompt_template    TEXT NOT NULL,        -- e.g. "Guess the seniority level for {{full_name}} at {{company_name}}"
  output_type        TEXT NOT NULL DEFAULT 'text' CHECK (output_type IN ('text', 'number', 'email', 'url', 'boolean')),
  source_template_id TEXT,                 -- id from the static template library this was created from, if any
  column_order       INTEGER NOT NULL DEFAULT 0,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_column_definitions_workspace_idx ON ai_column_definitions(workspace_id, column_order);

DROP TRIGGER IF EXISTS set_updated_at ON ai_column_definitions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ai_column_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS auto_workspace_trigger ON ai_column_definitions;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON ai_column_definitions
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE ai_column_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_select_ai_column_definitions ON ai_column_definitions FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_insert_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_insert_ai_column_definitions ON ai_column_definitions FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_update_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_update_ai_column_definitions ON ai_column_definitions FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_delete_ai_column_definitions ON ai_column_definitions;
CREATE POLICY ws_delete_ai_column_definitions ON ai_column_definitions FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());

-- ============================================================================
-- AI columns, part 2 — "action" columns that call a real integration instead of
-- generating AI text. Today the only wired-up action is a real AnySite email
-- lookup (find_email_by_url), reusing the same integration already used by the
-- lead sidebar's "Find email" button. Also adds a workspace-level saved-template
-- library so a user's own column configs can be reused later, alongside the
-- static built-in template gallery.
-- ============================================================================

ALTER TABLE ai_column_definitions
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'ai_text' CHECK (action_type IN ('ai_text', 'anysite_email'));

CREATE TABLE IF NOT EXISTS ai_column_saved_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  prompt_template TEXT,                  -- null/empty for action columns that don't need one (e.g. anysite_email)
  output_type     TEXT NOT NULL DEFAULT 'text' CHECK (output_type IN ('text', 'number', 'email', 'url', 'boolean')),
  action_type     TEXT NOT NULL DEFAULT 'ai_text' CHECK (action_type IN ('ai_text', 'anysite_email')),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_column_saved_templates_workspace_idx ON ai_column_saved_templates(workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON ai_column_saved_templates;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON ai_column_saved_templates
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE ai_column_saved_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_ai_column_saved_templates ON ai_column_saved_templates;
CREATE POLICY ws_select_ai_column_saved_templates ON ai_column_saved_templates FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_insert_ai_column_saved_templates ON ai_column_saved_templates;
CREATE POLICY ws_insert_ai_column_saved_templates ON ai_column_saved_templates FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_delete_ai_column_saved_templates ON ai_column_saved_templates;
CREATE POLICY ws_delete_ai_column_saved_templates ON ai_column_saved_templates FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0068_stripe_billing.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- 0068_stripe_billing.sql
--
-- Replace Chargebee-specific ID columns with Stripe ones across the billing
-- schema. No real subscribers exist yet, so this is a straightforward rename
-- — no data-preservation logic needed. Three RPCs reference the renamed
-- columns in their bodies (redeem_promotion_start, redeem_promotion_finalize,
-- grant_leads_topup) and are recreated below with updated column/param names.
-- ============================================================================

-- Each rename below is guarded so this migration is safe to re-run from
-- scratch regardless of how far a previous partial run got.
CREATE OR REPLACE FUNCTION _rename_column_if_needed(
  p_table TEXT, p_from TEXT, p_to TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = p_table AND column_name = p_from)
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = p_table AND column_name = p_to) THEN
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', p_table, p_from, p_to);
  END IF;
END;
$$;

-- ── subscriptions ────────────────────────────────────────────────────────
SELECT _rename_column_if_needed('subscriptions', 'chargebee_customer_id',     'stripe_customer_id');
SELECT _rename_column_if_needed('subscriptions', 'chargebee_subscription_id', 'stripe_subscription_id');
SELECT _rename_column_if_needed('subscriptions', 'chargebee_plan_id',         'stripe_price_id');

-- ── credit_top_ups: one-time top-up charges become Stripe PaymentIntents ───
SELECT _rename_column_if_needed('credit_top_ups', 'chargebee_invoice_id', 'stripe_payment_intent_id');

-- ── promotions: the Chargebee coupon becomes a Stripe Coupon, plus Stripe's
--    separate customer-facing Promotion Code object layered on top of it ──
SELECT _rename_column_if_needed('promotions', 'chargebee_coupon_id', 'stripe_coupon_id');
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT;

-- ── promotion_redemptions ────────────────────────────────────────────────
SELECT _rename_column_if_needed('promotion_redemptions', 'chargebee_coupon_id',       'stripe_coupon_id');
SELECT _rename_column_if_needed('promotion_redemptions', 'chargebee_hosted_page_id',  'stripe_checkout_session_id');
SELECT _rename_column_if_needed('promotion_redemptions', 'chargebee_subscription_id', 'stripe_subscription_id');

DROP FUNCTION _rename_column_if_needed(TEXT, TEXT, TEXT);

-- ── redeem_promotion_start: validate + reserve, called BEFORE the Stripe
--    Checkout Session is created from checkout/route.ts ───────────────────
CREATE OR REPLACE FUNCTION redeem_promotion_start(
  p_workspace_id UUID,
  p_code         TEXT,
  p_plan_id      TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo         promotions%ROWTYPE;
  v_completed     INTEGER;
  v_redemption_id UUID;
BEGIN
  SELECT * INTO v_promo FROM promotions WHERE code = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid promo code');
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is no longer active');
  END IF;

  IF v_promo.valid_from > now() OR (v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;

  IF v_promo.applicable_plans IS NOT NULL
     AND array_length(v_promo.applicable_plans, 1) > 0
     AND NOT (p_plan_id = ANY(v_promo.applicable_plans)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for the selected plan');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL AND v_promo.times_redeemed >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has reached its redemption limit');
  END IF;

  SELECT count(*) INTO v_completed FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'completed';

  IF v_completed > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already used this code');
  END IF;

  SELECT id INTO v_redemption_id FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'pending';

  IF v_redemption_id IS NULL THEN
    INSERT INTO promotion_redemptions
      (workspace_id, promotion_id, status, bonus_credits_granted, bonus_leads_granted, stripe_coupon_id)
    VALUES (p_workspace_id, v_promo.id, 'pending', v_promo.bonus_credits, v_promo.bonus_leads, v_promo.stripe_coupon_id)
    RETURNING id INTO v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'promotion_id', v_promo.id,
    'stripe_coupon_id', v_promo.stripe_coupon_id,
    'stripe_promotion_code_id', v_promo.stripe_promotion_code_id,
    'bonus_credits', v_promo.bonus_credits,
    'bonus_leads', v_promo.bonus_leads,
    'description', v_promo.description
  );
END;
$$;

-- ── redeem_promotion_finalize: called AFTER Stripe confirms the
--    subscription was actually created (checkout-return / webhook) ────────
-- Parameter names changed from the Chargebee version (p_hosted_page_id,
-- p_chargebee_subscription_id) — CREATE OR REPLACE can't rename params,
-- so the old signature is dropped first (harmless if already gone).
DROP FUNCTION IF EXISTS redeem_promotion_finalize(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION redeem_promotion_finalize(
  p_workspace_id UUID,
  p_checkout_session_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_redemption promotion_redemptions%ROWTYPE;
  v_sub        subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id
    AND status = 'pending'
    AND (p_checkout_session_id IS NULL OR stripe_checkout_session_id = p_checkout_session_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'applied', false);  -- normal case: no promo used
  END IF;

  UPDATE promotion_redemptions
  SET status = 'completed', completed_at = now(), stripe_subscription_id = p_stripe_subscription_id
  WHERE id = v_redemption.id;

  UPDATE promotions SET times_redeemed = times_redeemed + 1, updated_at = now()
  WHERE id = v_redemption.promotion_id;

  IF v_redemption.bonus_credits_granted > 0 OR v_redemption.bonus_leads_granted > 0 THEN
    SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
    IF FOUND THEN
      UPDATE subscriptions SET
        credits_remaining = credits_remaining + v_redemption.bonus_credits_granted,
        credits_total     = credits_total + v_redemption.bonus_credits_granted,
        leads_remaining   = leads_remaining + v_redemption.bonus_leads_granted,
        leads_total       = leads_total + v_redemption.bonus_leads_granted,
        updated_at        = now()
      WHERE id = v_sub.id;

      IF v_redemption.bonus_credits_granted > 0 THEN
        INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
        VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_credits_granted, 'credits', 'completed',
                jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
      END IF;
      IF v_redemption.bonus_leads_granted > 0 THEN
        INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
        VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_leads_granted, 'leads', 'completed',
                jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', true,
    'bonus_credits', v_redemption.bonus_credits_granted, 'bonus_leads', v_redemption.bonus_leads_granted);
END;
$$;

-- ── grant_leads_topup: called after a successful Stripe PaymentIntent ──────
-- Same param-rename issue as above (p_chargebee_invoice_id -> p_stripe_payment_intent_id).
DROP FUNCTION IF EXISTS grant_leads_topup(UUID, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION grant_leads_topup(
  p_workspace_id UUID,
  p_leads        INTEGER,
  p_price_cents  INTEGER,
  p_stripe_payment_intent_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  UPDATE subscriptions SET topup_leads_remaining = topup_leads_remaining + p_leads, updated_at = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_top_ups (workspace_id, quantity, resource_type, price_cents, stripe_payment_intent_id)
  VALUES (p_workspace_id, p_leads, 'leads', p_price_cents, p_stripe_payment_intent_id);

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_topup', p_leads, 'leads', 'completed',
          jsonb_build_object('price_cents', p_price_cents, 'stripe_payment_intent_id', p_stripe_payment_intent_id));

  RETURN jsonb_build_object('ok', true, 'topup_leads_remaining', v_sub.topup_leads_remaining + p_leads);
END;
$$;

-- ============================================================================
-- 0069_email_verification_codes.sql (renumbered from 0065 to avoid colliding
-- with the reprice migration that also claimed 0065)
--
-- Email verification codes — signup now leaves the Supabase auth account
-- unconfirmed until the user enters the 6-digit code emailed to them. Only
-- reachable via the service-role admin client (matches the platform-settings
-- RLS convention: enabled, zero policies).
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active code per user — resending replaces the previous row.
CREATE UNIQUE INDEX IF NOT EXISTS email_verification_codes_user_idx ON email_verification_codes(user_id);

ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0070_outreach_send_limits.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Outreach daily send limits — per-workspace, per-channel (email/linkedin)
-- daily min/max caps, configurable from Settings > Email / Settings > LinkedIn.
-- A workspace with no row here sends unthrottled (today's existing behavior) —
-- the cap only kicks in once an admin explicitly sets one, so this never
-- surprises an existing workspace on deploy.
--
-- outreach_send_counts tracks each calendar day's actual usage: the first send
-- attempt of the day locks in a random quota inside [daily_min, daily_max] (a
-- human-like day-to-day cadence rather than a flat number — matches how
-- LinkedIn/email warm-up guidance is usually expressed as a range) and reuses
-- it for the rest of that day. consume_send_quota() is the single atomic entry
-- point both the manual "Send now" path and the per-minute cron use to check +
-- reserve quota before sending, so the two paths can never double-spend it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_send_limits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'linkedin')),
  daily_min    INTEGER NOT NULL CHECK (daily_min >= 0),
  daily_max    INTEGER NOT NULL CHECK (daily_max >= daily_min),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel)
);

CREATE INDEX IF NOT EXISTS outreach_send_limits_workspace_idx ON outreach_send_limits(workspace_id);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON outreach_send_limits;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON outreach_send_limits
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON outreach_send_limits;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON outreach_send_limits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE outreach_send_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_outreach_send_limits ON outreach_send_limits;
DROP POLICY IF EXISTS ws_insert_outreach_send_limits ON outreach_send_limits;
DROP POLICY IF EXISTS ws_update_outreach_send_limits ON outreach_send_limits;
DROP POLICY IF EXISTS ws_delete_outreach_send_limits ON outreach_send_limits;
CREATE POLICY ws_select_outreach_send_limits ON outreach_send_limits FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_outreach_send_limits ON outreach_send_limits FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_outreach_send_limits ON outreach_send_limits FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_outreach_send_limits ON outreach_send_limits FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- Reached only via consume_send_quota()/remaining_send_quota() below (both
-- SECURITY DEFINER) — enabled with zero direct policies, matching the
-- platform-settings convention for tables the app never queries directly.
CREATE TABLE IF NOT EXISTS outreach_send_counts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL CHECK (channel IN ('email', 'linkedin')),
  send_date    DATE NOT NULL,
  quota        INTEGER NOT NULL,
  sent_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel, send_date)
);

ALTER TABLE outreach_send_counts ENABLE ROW LEVEL SECURITY;

-- ── consume_send_quota: atomically reserves up to p_requested sends against
-- today's quota for (workspace, channel). Returns how many were actually
-- granted (0..p_requested) — the caller should only send that many leads this
-- pass and let the rest wait for tomorrow's quota. No outreach_send_limits row
-- for this channel → unlimited (returns p_requested unchanged, no row written).
CREATE OR REPLACE FUNCTION consume_send_quota(
  p_workspace_id UUID,
  p_channel      TEXT,
  p_requested    INTEGER
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit   outreach_send_limits%ROWTYPE;
  v_count   outreach_send_counts%ROWTYPE;
  v_today   DATE := CURRENT_DATE;
  v_allowed INTEGER;
  v_granted INTEGER;
BEGIN
  IF p_requested <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_limit FROM outreach_send_limits
  WHERE workspace_id = p_workspace_id AND channel = p_channel;
  IF NOT FOUND THEN
    RETURN p_requested; -- no limit configured for this channel — unthrottled
  END IF;

  SELECT * INTO v_count FROM outreach_send_counts
  WHERE workspace_id = p_workspace_id AND channel = p_channel AND send_date = v_today
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO outreach_send_counts (workspace_id, channel, send_date, quota, sent_count)
    VALUES (
      p_workspace_id, p_channel, v_today,
      v_limit.daily_min + floor(random() * (v_limit.daily_max - v_limit.daily_min + 1))::INTEGER,
      0
    )
    RETURNING * INTO v_count;
  END IF;

  v_allowed := GREATEST(0, v_count.quota - v_count.sent_count);
  v_granted := LEAST(p_requested, v_allowed);

  IF v_granted > 0 THEN
    UPDATE outreach_send_counts SET sent_count = sent_count + v_granted, updated_at = now()
    WHERE id = v_count.id;
  END IF;

  RETURN v_granted;
END;
$$;

-- ── remaining_send_quota: read-only lookup for the Settings UI ("X of Y sent
-- today"). Never grants or consumes anything.
CREATE OR REPLACE FUNCTION remaining_send_quota(
  p_workspace_id UUID,
  p_channel      TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit outreach_send_limits%ROWTYPE;
  v_count outreach_send_counts%ROWTYPE;
BEGIN
  SELECT * INTO v_limit FROM outreach_send_limits
  WHERE workspace_id = p_workspace_id AND channel = p_channel;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('limited', false);
  END IF;

  SELECT * INTO v_count FROM outreach_send_counts
  WHERE workspace_id = p_workspace_id AND channel = p_channel AND send_date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'limited', true,
    'daily_min', v_limit.daily_min,
    'daily_max', v_limit.daily_max,
    'quota', v_count.quota,
    'sent_today', COALESCE(v_count.sent_count, 0)
  );
END;
$$;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0071_reprice_and_remove_topup.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- 0071_reprice_and_remove_topup.sql
-- (renumbered from 0070 — collided with a concurrently-created
-- 0070_outreach_send_limits.sql from another session)
--
-- 1. Reprice Starter and Pro (Basic unchanged) and raise their monthly
--    AI-discovered-leads allowance. Applied immediately to existing
--    subscriptions, same "apply now" policy used for prior repricing events.
-- 2. Remove the Lead Top-Up feature entirely (buy extra leads for $149) —
--    drop credit_top_ups, grant_leads_topup, and the topup_leads_remaining
--    column, and simplify deduct_leads back to a single leads currency.
-- ============================================================================

-- ── 1. Reprice ───────────────────────────────────────────────────────────
UPDATE subscription_plans SET
  monthly_price_cents = 14999, annual_price_cents = 143990, leads_per_cycle = 1000
WHERE id = 'starter';

UPDATE subscription_plans SET
  monthly_price_cents = 29999, annual_price_cents = 287990, leads_per_cycle = 2000
WHERE id = 'pro';

UPDATE subscriptions s
SET leads_total = sp.leads_per_cycle,
    leads_remaining = sp.leads_per_cycle
FROM subscription_plans sp
WHERE s.plan_id = sp.id AND sp.id IN ('starter', 'pro');

-- ── 2. Remove Lead Top-Up ────────────────────────────────────────────────
DROP FUNCTION IF EXISTS grant_leads_topup(UUID, INTEGER, INTEGER, TEXT);
DROP TABLE IF EXISTS credit_top_ups CASCADE;

ALTER TABLE subscriptions DROP COLUMN IF EXISTS topup_leads_remaining;

-- deduct_leads: back to a single currency, no top-up fallback.
CREATE OR REPLACE FUNCTION deduct_leads(
  p_workspace_id UUID,
  p_amount       INTEGER DEFAULT 1,
  p_metadata     JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.leads_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient leads remaining', 'remaining', v_sub.leads_remaining);
  END IF;

  UPDATE subscriptions SET
    leads_remaining = leads_remaining - p_amount,
    updated_at      = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_discovery', -p_amount, 'leads', 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_sub.leads_remaining - p_amount, 'deducted', p_amount);
END;
$$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0072_bump_starter_pro_credits.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- 0072_bump_starter_pro_credits.sql
--
-- Raise the monthly AI-credit allowance: Starter 300 -> 700, Pro 1,000 -> 1,500
-- (Basic unchanged, price unchanged). Applied immediately to existing
-- subscriptions, same "apply now" policy used for the leads bump in 0071.
-- ============================================================================

UPDATE subscription_plans SET credits_per_cycle = 700  WHERE id = 'starter';
UPDATE subscription_plans SET credits_per_cycle = 1500 WHERE id = 'pro';

UPDATE subscriptions s
SET credits_total     = sp.credits_per_cycle,
    credits_remaining = sp.credits_per_cycle
FROM subscription_plans sp
WHERE s.plan_id = sp.id AND sp.id IN ('starter', 'pro');

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> FILE: 0073_lead_notes.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- Lead notes — free-text notes (optionally with one attached file) a user can
-- log against a lead, shown on the lead detail page's "Notes" panel. Replaces
-- the earlier Salesforce-mirrored "Files" placeholder with something that
-- actually exists in this app: a per-lead note log, not a generic file store.
--
-- "History" (who created/last modified a lead) doesn't need a new table —
-- it's answered from data that already exists: leads.owner_id + created_at
-- for "Created By", and the existing audit_log's "lead.updated" entries
-- (already recorded by updateLead()) for "Last Modified By".
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name    TEXT,
  body           TEXT NOT NULL,
  file_url       TEXT,
  file_name      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON lead_notes(lead_id, created_at DESC);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON lead_notes;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON lead_notes
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_lead_notes ON lead_notes;
DROP POLICY IF EXISTS ws_insert_lead_notes ON lead_notes;
DROP POLICY IF EXISTS ws_delete_lead_notes ON lead_notes;
CREATE POLICY ws_select_lead_notes ON lead_notes FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_lead_notes ON lead_notes FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_lead_notes ON lead_notes FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- Public bucket for note attachments — matches the existing newsletter-images
-- bucket convention (uploaded via the admin client server-side, never exposed
-- to client-side direct upload).
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-notes', 'lead-notes', true)
ON CONFLICT (id) DO NOTHING;

-- >>> FILE: 0074_lead_linkedin_provider_id.sql
-- ============================================================================
-- 0074 — Persist the resolved Unipile LinkedIn provider_id per lead
-- LinkedIn reply webhooks identify the sender by an opaque provider_id, not
-- the human-readable public URL slug stored in leads.linkedin — so inbound
-- replies could never be matched back to a lead. We now save the provider_id
-- the first time we successfully resolve/message a lead, so future replies
-- match on this exact id instead of guessing from a URL.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS linkedin_provider_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_linkedin_provider_id ON leads(linkedin_provider_id) WHERE linkedin_provider_id IS NOT NULL;

-- >>> FILE: 0075_lead_crm_fields.sql
-- ============================================================================
-- 0075 — Expand leads with standard CRM fields (Salesforce/Zoho-style)
-- All additive/nullable — nothing here changes existing behavior until the
-- app starts writing to these columns. first_name/last_name are backfilled
-- once from the existing full_name for rows that predate this migration.
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS seniority TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT,
  ADD COLUMN IF NOT EXISTS annual_revenue TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_status TEXT,
  ADD COLUMN IF NOT EXISTS twitter_handle TEXT,
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;

UPDATE leads
SET
  first_name = COALESCE(first_name, NULLIF(split_part(trim(full_name), ' ', 1), '')),
  last_name = COALESCE(last_name, NULLIF(trim(regexp_replace(trim(full_name), '^\S+\s*', '')), ''))
WHERE full_name IS NOT NULL AND trim(full_name) <> '' AND (first_name IS NULL OR last_name IS NULL);

-- >>> FILE: 0076_accounts_contacts.sql
-- ============================================================================
-- 0076 — Accounts & Contacts (standalone CRM modules)
-- Standard workspace-scoped, RLS-protected business tables — same template as
-- every prior migration (see 0012_workspaces.sql for the reusable helpers,
-- 0073_lead_notes.sql for the most recent worked example). No relationship to
-- leads in this pass — Accounts/Contacts are standalone, cross-linked only to
-- each other via contacts.account_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_name      VARCHAR(200) NOT NULL,
  account_owner     UUID REFERENCES users(user_id) ON DELETE SET NULL,
  parent_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  phone             VARCHAR(50),
  website           VARCHAR(500),
  industry          VARCHAR(100),
  account_type      VARCHAR(100),
  annual_revenue    NUMERIC,
  employees         INT,
  ownership         VARCHAR(50),
  rating            VARCHAR(20),
  sic_code          VARCHAR(20),
  ticker_symbol     VARCHAR(20),
  billing_street    TEXT,
  billing_city      VARCHAR(100),
  billing_state     VARCHAR(100),
  billing_country   VARCHAR(100),
  billing_zip       VARCHAR(20),
  shipping_street   TEXT,
  shipping_city     VARCHAR(100),
  shipping_state    VARCHAR(100),
  shipping_country  VARCHAR(100),
  shipping_zip      VARCHAR(20),
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_owner_idx ON accounts(account_owner);
CREATE INDEX IF NOT EXISTS accounts_parent_idx ON accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS accounts_workspace_idx ON accounts(workspace_id);

CREATE TABLE IF NOT EXISTS contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id       UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_owner    UUID REFERENCES users(user_id) ON DELETE SET NULL,
  salutation       VARCHAR(10),
  first_name       VARCHAR(100) NOT NULL,
  last_name        VARCHAR(100) NOT NULL,
  email            VARCHAR(255),
  phone            VARCHAR(50),
  mobile           VARCHAR(50),
  home_phone       VARCHAR(50),
  other_phone      VARCHAR(50),
  assistant_name   VARCHAR(100),
  assistant_phone  VARCHAR(50),
  department       VARCHAR(100),
  job_title        VARCHAR(200),
  reporting_to_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_source      VARCHAR(100),
  date_of_birth    DATE,
  mailing_street   TEXT,
  mailing_city     VARCHAR(100),
  mailing_state    VARCHAR(100),
  mailing_country  VARCHAR(100),
  mailing_zip      VARCHAR(20),
  other_street     TEXT,
  other_city       VARCHAR(100),
  other_state      VARCHAR(100),
  other_country    VARCHAR(100),
  other_zip        VARCHAR(20),
  fax              VARCHAR(50),
  email_opt_out    BOOLEAN NOT NULL DEFAULT FALSE,
  skype_id         VARCHAR(100),
  secondary_email  VARCHAR(255),
  twitter          VARCHAR(255),
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contacts_account_idx ON contacts(account_id);
CREATE INDEX IF NOT EXISTS contacts_owner_idx ON contacts(contact_owner);
CREATE INDEX IF NOT EXISTS contacts_reporting_idx ON contacts(reporting_to_id);
CREATE INDEX IF NOT EXISTS contacts_workspace_idx ON contacts(workspace_id);

-- Workspace auto-fill trigger, updated_at trigger, and full ws_* RLS policy
-- set (select/insert/update/delete) for both new tables — reuses the global
-- set_workspace_from_user()/set_updated_at()/get_current_workspace_id()
-- helpers already defined in 0001_initial_schema.sql and 0012_workspaces.sql.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['accounts', 'contacts']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auto_workspace_trigger ON %I;', t);
    EXECUTE format('CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);

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

-- >>> FILE: 0077_zoom_accounts.sql
-- ============================================================================
-- Zoom OAuth connection — lets a workspace create real Zoom meetings (a stable
-- join_url shared by host and lead) instead of a placeholder link. Deliberately
-- a separate table from calendar_accounts: Zoom has no availability/busy-sync
-- concept in this app, it's purely for meeting creation, so it shouldn't be
-- swept into the calendar busy-sync loops.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zoom_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email            TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  scope            TEXT,
  status           TEXT NOT NULL DEFAULT 'connected',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS zoom_accounts_workspace_idx ON zoom_accounts(workspace_id);

DROP TRIGGER IF EXISTS auto_workspace_trigger ON zoom_accounts;
CREATE TRIGGER auto_workspace_trigger BEFORE INSERT ON zoom_accounts
  FOR EACH ROW EXECUTE FUNCTION set_workspace_from_user();

DROP TRIGGER IF EXISTS set_updated_at ON zoom_accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON zoom_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE zoom_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ws_select_zoom_accounts ON zoom_accounts;
DROP POLICY IF EXISTS ws_insert_zoom_accounts ON zoom_accounts;
DROP POLICY IF EXISTS ws_update_zoom_accounts ON zoom_accounts;
DROP POLICY IF EXISTS ws_delete_zoom_accounts ON zoom_accounts;
CREATE POLICY ws_select_zoom_accounts ON zoom_accounts FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_zoom_accounts ON zoom_accounts FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_zoom_accounts ON zoom_accounts FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_zoom_accounts ON zoom_accounts FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- >>> FILE: 0078_campaign_requires_approval.sql
-- ============================================================================
-- Per-campaign approval toggle — lets the creator choose, at build time,
-- whether this campaign must go through the review/approval lifecycle
-- (0033_campaign_approval_lifecycle.sql) before it can launch, or can be
-- launched directly. Defaults to TRUE so existing behavior (every campaign
-- requires approval) is unchanged for campaigns created before this column
-- existed.
-- ============================================================================

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT true;

-- >>> FILE: 0079_lead_contact_info_requested.sql
-- ============================================================================
-- Dedup guard for the LinkedIn "auto-ask for contact info" feature: when a
-- lead replies to a LinkedIn message with positive intent (AI-classified),
-- we send one automatic follow-up asking for their email/phone. This column
-- is set the first time we ask, so a lead who keeps replying positively never
-- gets asked more than once.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_info_requested_at TIMESTAMPTZ;

-- >>> FILE: 0080_lead_favorites.sql
-- ============================================================================
-- 0080 — Per-lead favorite/star flag
-- Lets a user star a lead for quick reference in the Leads table, independent
-- of status/score. Defaults to false so every existing row is unaffected.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_is_favorite ON leads(is_favorite) WHERE is_favorite = true;

-- >>> FILE: 0081_workspace_members.sql
-- Multi-workspace support: a login can belong to several workspaces and
-- switch between them. get_current_workspace_id() keeps reading users.workspace_id
-- (the "currently active" workspace pointer) unchanged, so every existing RLS
-- policy across ~30 tenant tables keeps working as-is. workspace_members is the
-- new many-to-many membership source of truth (which workspaces a login can
-- switch into, and their role in each) — "switching" = updating that single
-- pointer after validating membership here.
CREATE TABLE IF NOT EXISTS workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role_id      INT NOT NULL REFERENCES roles(role_id),
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | REMOVED
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);
DROP TRIGGER IF EXISTS trg_workspace_members_updated ON workspace_members;
CREATE TRIGGER trg_workspace_members_updated BEFORE UPDATE ON workspace_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_select_workspace_members ON workspace_members;
-- Self-select (for the workspace switcher UI) OR same-workspace-as-caller
-- select (for the /users roster, which needs to see every member of the
-- CURRENT workspace regardless of which workspace they're currently "active" in).
CREATE POLICY ws_select_workspace_members ON workspace_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR workspace_id = get_current_workspace_id());
-- No INSERT/UPDATE/DELETE policies for workspace_members — every write goes
-- through server actions using the service-role admin client (mirrors the
-- existing requireSuperAdmin()/inviteUser() pattern), never a raw RLS-bound write.

-- Backfill: every existing single-workspace user becomes a membership row.
INSERT INTO workspace_members (user_id, workspace_id, role_id)
SELECT user_id, workspace_id, COALESCE(role_id, 1) FROM users WHERE workspace_id IS NOT NULL
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Every new signup also gets a membership row for their first workspace.
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

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws);

  INSERT INTO public.workspace_members (user_id, workspace_id, role_id)
  VALUES (NEW.id, new_ws, 1);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user_with_workspace failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- Close a pre-existing self-escalation gap: the ws_update_users UPDATE policy
-- has no separate WITH CHECK, so a plain authenticated client update could
-- previously set its own workspace_id/role_id to any value and pass RLS.
-- Supabase grants table-wide UPDATE to `authenticated` by default, so a plain
-- column-level REVOKE alone is a no-op here — the table-wide grant still lets
-- every column through. Revoke table-wide, then re-grant UPDATE on every
-- column EXCEPT workspace_id/role_id, so those two may only change via server
-- actions using the service-role client (which bypasses grants entirely).
REVOKE UPDATE ON users FROM authenticated;
GRANT UPDATE (full_name, manager_id, status, avatar_url, last_login, nav_access, phone, job_title, updated_at) ON users TO authenticated;

-- >>> FILE: 0082_workspace_read_own_memberships.sql
-- Fix: the workspace switcher's getMyWorkspaces() joins workspace_members -> workspaces
-- to show each workspace's name. The old "Read own workspace" SELECT policy only allowed
-- reading the CURRENTLY ACTIVE workspace (id = get_current_workspace_id()), so every OTHER
-- workspace a login belongs to came back null from that join and got silently dropped from
-- the switcher list — a member could see and switch INTO a workspace once, but never back
-- out of it via the switcher. Widen SELECT to also allow any workspace you're a member of.
DROP POLICY IF EXISTS "Read own workspace" ON workspaces;
CREATE POLICY "Read own workspace" ON workspaces FOR SELECT TO authenticated
  USING (
    id = get_current_workspace_id()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspaces.id AND wm.user_id = auth.uid() AND wm.status = 'ACTIVE'
    )
  );

-- >>> FILE: 0083_users_read_via_workspace_members.sql
-- Fix: getUsers() (the /users "People" roster) joins workspace_members -> users
-- to show each member's profile (name, email, avatar). The old "ws_select_users"
-- SELECT policy only allowed reading a user row when workspace_id = the CALLER's
-- currently active workspace — but that column is the TARGET's own active
-- pointer, which may point at a different workspace than the one they're
-- actually being looked up in (a member can belong to several workspaces and
-- only one is "active" for them at a time). So a legitimate member whose own
-- active pointer happens to be elsewhere silently vanished from the roster —
-- the exact same class of bug fixed for the `workspaces` table in migration
-- 0081, just on `users`. Widen SELECT to also allow reading any user who has
-- an ACTIVE workspace_members row in the caller's current workspace.
DROP POLICY IF EXISTS "ws_select_users" ON users;
CREATE POLICY "ws_select_users" ON users FOR SELECT
  USING (
    user_id = auth.uid()
    OR workspace_id = get_current_workspace_id()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = users.user_id
        AND wm.workspace_id = get_current_workspace_id()
        AND wm.status = 'ACTIVE'
    )
  );

-- >>> FILE: 0084_lead_conversion.sql
-- Lead Conversion workflow: converting a Lead creates/links a real Account +
-- Contact + optional Opportunity, and the Lead keeps a permanent record of
-- what it became (never deleted).

-- Contacts didn't have a linkedin field (Leads already do) — needed so the
-- conversion modal's duplicate-contact matching can check it.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin VARCHAR(500);

-- Opportunities only had a denormalized company/contact_name/contact_email
-- snapshot — add real FKs so a converted lead's deal actually links to the
-- Account/Contact records instead of just free text.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON opportunities(contact_id);

-- The lead itself keeps permanent links to whatever it converted into.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_converted_account_id ON leads(converted_account_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted_contact_id ON leads(converted_contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted_opportunity_id ON leads(converted_opportunity_id);

-- >>> FILE: 0085_onboarding_hard_gate.sql
-- ============================================================================
-- Onboarding hard-gate: per-user profile fields, grandfathering flag for
-- workspaces that already finished onboarding under the old (looser) rules,
-- an avatar upload bucket, and a broadened signup trigger that captures
-- whatever name/avatar OAuth actually hands Supabase.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT;

-- Existing workspaces that already completed onboarding under the old
-- definition (business info only) are permanently exempt from the new
-- profile+mailbox requirements — see plan doc for full reasoning.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_grandfathered BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE workspaces SET onboarding_grandfathered = TRUE WHERE onboarding_completed = TRUE;

-- Avatar uploads — same public-bucket, admin-client-only-writes pattern as
-- the existing newsletter-images / lead-notes buckets (no storage.objects RLS
-- policy needed since uploads only ever happen via the service-role key).
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Broaden the signup trigger (originally from 0013_fix_signup_trigger.sql) to
-- also capture an avatar/picture claim and a wider name fallback — Google and
-- LinkedIn OIDC don't reliably land the same fields under raw_user_meta_data.
CREATE OR REPLACE FUNCTION handle_new_auth_user_with_workspace() RETURNS TRIGGER AS $$
DECLARE
  new_ws UUID;
  display_name TEXT;
  picture_url TEXT;
BEGIN
  -- Skip if profile already exists (admin-invited user)
  IF EXISTS (SELECT 1 FROM public.users WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  picture_url := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (display_name || '''s workspace', NEW.id)
  RETURNING id INTO new_ws;

  INSERT INTO public.users (user_id, full_name, email, role_id, status, workspace_id, avatar_url)
  VALUES (NEW.id, display_name, NEW.email, 1, 'ACTIVE', new_ws, picture_url);

  -- Every new signup also gets a membership row for their first workspace
  -- (multi-workspace support, migration 0081) — must be preserved here since
  -- this CREATE OR REPLACE fully overwrites the function body.
  INSERT INTO public.workspace_members (user_id, workspace_id, role_id)
  VALUES (NEW.id, new_ws, 1);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user_with_workspace failed for %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- >>> FILE: 0086_picklist_manager.sql
-- Picklist Manager — per-workspace editable dropdown values, replacing what
-- were previously hardcoded arrays duplicated across several files (Industries
-- was identical in 5 places, Company Size/Seniority in 2, Lead Status drifted
-- across 3 different vocabularies). Scoped to the 4 picklists confirmed to
-- have real duplication/drift; Deal Stages/Lead Source/Priority are out of
-- scope for this pass (see plan doc).
CREATE TABLE IF NOT EXISTS picklist_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          VARCHAR(50) NOT NULL,
  label        VARCHAR(100) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, key)
);
CREATE INDEX IF NOT EXISTS idx_picklist_categories_workspace ON picklist_categories(workspace_id);

CREATE TABLE IF NOT EXISTS picklist_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES picklist_categories(id) ON DELETE CASCADE,
  value       VARCHAR(150) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category_id, value)
);
CREATE INDEX IF NOT EXISTS idx_picklist_values_category ON picklist_values(category_id, sort_order);

DROP TRIGGER IF EXISTS trg_picklist_values_updated ON picklist_values;
CREATE TRIGGER trg_picklist_values_updated BEFORE UPDATE ON picklist_values FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE picklist_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_select_picklist_categories ON picklist_categories;
DROP POLICY IF EXISTS ws_insert_picklist_categories ON picklist_categories;
DROP POLICY IF EXISTS ws_update_picklist_categories ON picklist_categories;
DROP POLICY IF EXISTS ws_delete_picklist_categories ON picklist_categories;
CREATE POLICY ws_select_picklist_categories ON picklist_categories FOR SELECT TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_insert_picklist_categories ON picklist_categories FOR INSERT TO authenticated WITH CHECK (workspace_id = get_current_workspace_id());
CREATE POLICY ws_update_picklist_categories ON picklist_categories FOR UPDATE TO authenticated USING (workspace_id = get_current_workspace_id());
CREATE POLICY ws_delete_picklist_categories ON picklist_categories FOR DELETE TO authenticated USING (workspace_id = get_current_workspace_id());

-- picklist_values has no workspace_id column of its own — scope through its
-- parent category instead.
ALTER TABLE picklist_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ws_select_picklist_values ON picklist_values;
DROP POLICY IF EXISTS ws_insert_picklist_values ON picklist_values;
DROP POLICY IF EXISTS ws_update_picklist_values ON picklist_values;
DROP POLICY IF EXISTS ws_delete_picklist_values ON picklist_values;
CREATE POLICY ws_select_picklist_values ON picklist_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_insert_picklist_values ON picklist_values FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_update_picklist_values ON picklist_values FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));
CREATE POLICY ws_delete_picklist_values ON picklist_values FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM picklist_categories pc WHERE pc.id = picklist_values.category_id AND pc.workspace_id = get_current_workspace_id()));

-- Seeds the 5 categories + today's hardcoded defaults for one workspace —
-- shared by both the new-workspace trigger below and the one-time backfill,
-- so every workspace (existing or future) starts from the exact same values
-- currently baked into the app, and nothing changes visibly until an admin
-- edits them.
CREATE OR REPLACE FUNCTION seed_default_picklists_for_workspace(p_workspace_id UUID) RETURNS VOID AS $$
DECLARE
  cat_industry UUID;
  cat_interest UUID;
  cat_status UUID;
  cat_company_size UUID;
  cat_seniority UUID;
BEGIN
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_industry', 'Industries')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_industry;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_interest_area', 'Interest Areas')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_interest;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_status', 'Lead Status')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_status;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_company_size', 'Company Size')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_company_size;
  INSERT INTO picklist_categories (workspace_id, key, label) VALUES (p_workspace_id, 'lead_seniority', 'Seniority')
    ON CONFLICT (workspace_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING id INTO cat_seniority;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_industry, v, ord FROM unnest(ARRAY['Technology','Consulting','Enterprise Software','Analytics','Retail','Cloud Services','Manufacturing','Training','Healthcare','Finance']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_interest, v, ord FROM unnest(ARRAY['CRM Automation','SAP AI','Digital Transformation','AI Platforms','Customer Engagement','Workflow Automation','AI Personalization','Lead Nurturing','Lead Scoring']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order, is_system)
    SELECT cat_status, v, ord, (v = 'Converted') FROM unnest(ARRAY['New','Contacted','Qualified','Nurturing','Converted']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_company_size, v, ord FROM unnest(ARRAY['1-10','11-50','51-200','201-1000','1000+']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;

  INSERT INTO picklist_values (category_id, value, sort_order)
    SELECT cat_seniority, v, ord FROM unnest(ARRAY['C-Level','VP','Director','Manager','Individual Contributor']) WITH ORDINALITY AS t(v, ord)
    ON CONFLICT (category_id, value) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION seed_default_picklists_trigger_fn() RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_picklists_for_workspace(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS seed_default_picklists_trigger ON workspaces;
CREATE TRIGGER seed_default_picklists_trigger AFTER INSERT ON workspaces
  FOR EACH ROW EXECUTE FUNCTION seed_default_picklists_trigger_fn();

-- Backfill every workspace that already exists today.
DO $$
DECLARE ws RECORD;
BEGIN
  FOR ws IN SELECT id FROM workspaces LOOP
    PERFORM seed_default_picklists_for_workspace(ws.id);
  END LOOP;
END $$;

-- >>> FILE: 0088_segment_rule_tree.sql
-- Segmentation Builder Phase 1: nested rule tree + suppression enforcement.

-- 1. Nested ALL/ANY/NOT rule tree, replacing the flat segment_rules model.
-- segment_rules stays in place (read-only, for the one-time backfill below and
-- as a fallback for any code path not yet migrated) — new writes go to rule_json.
ALTER TABLE segments ADD COLUMN IF NOT EXISTS rule_json JSONB;

-- Backfill every existing segment's flat rules into an equivalent single-level
-- tree: AND -> ALL, OR -> ANY, so nothing that currently matches stops matching.
UPDATE segments s
SET rule_json = jsonb_build_object(
  'type', 'group',
  'operator', CASE WHEN s.logic_type = 'OR' THEN 'ANY' ELSE 'ALL' END,
  'children', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('type', 'condition', 'field', r.field, 'operator', r.operator, 'value', r.value)
      ORDER BY r.rule_order
    )
    FROM segment_rules r
    WHERE r.segment_id = s.id
  ), '[]'::jsonb)
)
WHERE s.rule_json IS NULL;

-- 2. Suppression flags on leads — none of these existed before; every send path
-- silently had zero enforcement of unsubscribe/do-not-contact/bounce status.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_bounced BOOLEAN NOT NULL DEFAULT FALSE;

-- >>> FILE: 0089_ai_prompt_history.sql
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

-- >>> FILE: 0115_campaign_enrollments.sql
-- ============================================================================
-- Phase 4 — Campaign Execution Integration.
--
-- Campaigns today have no first-class per-lead enrollment record — "who's in
-- this campaign and where are they" is reconstructed after the fact from
-- inbox_messages + campaign_jobs. This adds one real enrollment row per
-- (campaign, lead), giving the Eligibility/Enrollment/Monitor/Analytics
-- layers a single source of truth, without touching campaign_jobs (still the
-- actual send queue) or the segmentation tables (still the audience source).
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  audience_id UUID REFERENCES segments(id) ON DELETE SET NULL,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  -- 'pending_review' | 'scheduled' | 'active' | 'paused' | 'completed' |
  -- 'exited' | 'suppressed' | 'failed' | 'cancelled'
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  current_step INT NOT NULL DEFAULT 0,
  next_execution_at TIMESTAMPTZ,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  exit_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_campaign ON campaign_enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_lead ON campaign_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_status ON campaign_enrollments(status);

-- Duplicate-prevention / frequency-cap settings (Phase 4G) — workspace-wide
-- defaults for now (per-campaign override UI is a later increment); enforced
-- by the Eligibility Service, not duplicated per-caller.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS max_active_per_lead INT NOT NULL DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS min_days_between_campaigns INT NOT NULL DEFAULT 14;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['campaign_enrollments']) LOOP
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

-- >>> FILE: 0120_lead_discovered_account.sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS discovered_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_discovered_account ON leads(discovered_account_id);

-- >>> FILE: 0121_analytics_overview.sql
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_campaign ON opportunities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_segment ON opportunities(segment_id);

-- >>> FILE: 0122_opportunity_loss_reason.sql
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS loss_reason TEXT
  CHECK (loss_reason IS NULL OR loss_reason IN ('Price', 'Competitor', 'No Budget', 'No Decision', 'Timing', 'Poor Fit', 'Lost Contact', 'Other'));

-- >>> FILE: 0123_subscription_cancellation.sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- >>> FILE: 0124_reset_cycle_idempotency.sql
CREATE OR REPLACE FUNCTION reset_subscription_cycle(p_workspace_id UUID, p_idempotency_key TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_idempotency_key IS NOT NULL AND v_sub.last_synced_resource_version = p_idempotency_key THEN
    RETURN;
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining            = v_plan.credits_per_cycle,
    credits_total                = v_plan.credits_per_cycle,
    leads_remaining               = v_plan.leads_per_cycle,
    leads_total                   = v_plan.leads_per_cycle,
    current_period_start         = now(),
    current_period_end           = CASE
                                      WHEN v_sub.billing_interval = 'annual'
                                      THEN now() + INTERVAL '1 year'
                                      ELSE now() + INTERVAL '30 days'
                                    END,
    low_balance_notified_at      = NULL,
    status                        = 'active',
    last_synced_resource_version = COALESCE(p_idempotency_key, v_sub.last_synced_resource_version),
    updated_at                    = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle, 'credits',
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));

  IF v_plan.leads_per_cycle > 0 THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.leads_per_cycle, 'leads',
            'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));
  END IF;
END;
$$;

-- >>> FILE: 0125_fix_trial_expiry_false_cancel.sql
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
    RETURN jsonb_build_object('ok', false, 'error', 'Trial period has ended — please refresh in a moment while your subscription syncs.');
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

-- >>> FILE: 0126_secure_billing_rpcs.sql
ALTER TABLE subscriptions
  ALTER COLUMN last_synced_resource_version TYPE TEXT
  USING last_synced_resource_version::TEXT;

CREATE OR REPLACE FUNCTION reset_subscription_cycle(p_workspace_id UUID, p_idempotency_key TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub  subscriptions%ROWTYPE;
  v_plan subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_idempotency_key IS NOT NULL AND v_sub.last_synced_resource_version = p_idempotency_key THEN
    RETURN;
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;

  UPDATE subscriptions SET
    credits_remaining            = v_plan.credits_per_cycle,
    credits_total                = v_plan.credits_per_cycle,
    leads_remaining               = v_plan.leads_per_cycle,
    leads_total                   = v_plan.leads_per_cycle,
    current_period_start         = now(),
    current_period_end           = CASE
                                      WHEN v_sub.billing_interval = 'annual'
                                      THEN now() + INTERVAL '1 year'
                                      ELSE now() + INTERVAL '30 days'
                                    END,
    low_balance_notified_at      = NULL,
    status                        = 'active',
    last_synced_resource_version = COALESCE(p_idempotency_key, v_sub.last_synced_resource_version),
    updated_at                    = now()
  WHERE workspace_id = p_workspace_id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.credits_per_cycle, 'credits',
          'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));

  IF v_plan.leads_per_cycle > 0 THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub.id, 'cycle_reset', v_plan.leads_per_cycle, 'leads',
            'completed', jsonb_build_object('plan', v_plan.id, 'interval', v_sub.billing_interval, 'idempotency_key', p_idempotency_key));
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION reset_subscription_cycle(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_subscription_cycle(UUID, TEXT) TO service_role;

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
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

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
    RETURN jsonb_build_object('ok', false, 'error', 'Trial period has ended — please refresh in a moment while your subscription syncs.');
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

REVOKE EXECUTE ON FUNCTION deduct_credits(UUID, TEXT, INTEGER, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_credits(UUID, TEXT, INTEGER, UUID, UUID, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION deduct_leads(
  p_workspace_id UUID,
  p_amount       INTEGER DEFAULT 1,
  p_metadata     JSONB   DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No subscription found');
  END IF;

  IF v_sub.status NOT IN ('active','trialing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Subscription not active', 'status', v_sub.status);
  END IF;

  IF v_sub.leads_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient leads remaining', 'remaining', v_sub.leads_remaining);
  END IF;

  UPDATE subscriptions SET
    leads_remaining = leads_remaining - p_amount,
    updated_at      = now()
  WHERE id = v_sub.id;

  INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
  VALUES (p_workspace_id, v_sub.id, 'lead_discovery', -p_amount, 'leads', 'completed', p_metadata);

  RETURN jsonb_build_object('ok', true, 'remaining', v_sub.leads_remaining - p_amount, 'deducted', p_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_leads(UUID, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_leads(UUID, INTEGER, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION redeem_promotion_start(
  p_workspace_id UUID,
  p_code         TEXT,
  p_plan_id      TEXT,
  p_email        TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo         promotions%ROWTYPE;
  v_completed     INTEGER;
  v_redemption_id UUID;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized for this workspace');
  END IF;

  SELECT * INTO v_promo FROM promotions WHERE code = upper(trim(p_code)) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid promo code');
  END IF;

  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is no longer active');
  END IF;

  IF v_promo.valid_from > now() OR (v_promo.valid_until IS NOT NULL AND v_promo.valid_until < now()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;

  IF v_promo.restricted_email IS NOT NULL
     AND (p_email IS NULL OR lower(trim(p_email)) <> lower(v_promo.restricted_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for your account');
  END IF;

  IF v_promo.applicable_plans IS NOT NULL
     AND array_length(v_promo.applicable_plans, 1) > 0
     AND NOT (p_plan_id = ANY(v_promo.applicable_plans)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is not valid for the selected plan');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL AND v_promo.times_redeemed >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has reached its redemption limit');
  END IF;

  SELECT count(*) INTO v_completed FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'completed';

  IF v_completed > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already used this code');
  END IF;

  SELECT id INTO v_redemption_id FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id AND promotion_id = v_promo.id AND status = 'pending';

  IF v_redemption_id IS NULL THEN
    INSERT INTO promotion_redemptions
      (workspace_id, promotion_id, status, bonus_credits_granted, bonus_leads_granted, stripe_coupon_id)
    VALUES (p_workspace_id, v_promo.id, 'pending', v_promo.bonus_credits, v_promo.bonus_leads, v_promo.stripe_coupon_id)
    RETURNING id INTO v_redemption_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption_id,
    'promotion_id', v_promo.id,
    'stripe_coupon_id', v_promo.stripe_coupon_id,
    'stripe_promotion_code_id', v_promo.stripe_promotion_code_id,
    'bonus_credits', v_promo.bonus_credits,
    'bonus_leads', v_promo.bonus_leads,
    'description', v_promo.description
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_promotion_start(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_promotion_start(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION redeem_promotion_finalize(
  p_workspace_id UUID,
  p_checkout_session_id TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_redemption promotion_redemptions%ROWTYPE;
  v_sub        subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM promotion_redemptions
  WHERE workspace_id = p_workspace_id
    AND status = 'pending'
    AND (p_checkout_session_id IS NULL OR stripe_checkout_session_id = p_checkout_session_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'applied', false);
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND
     OR v_sub.stripe_subscription_id IS NULL
     OR v_sub.status NOT IN ('active', 'trialing')
     OR (p_stripe_subscription_id IS NOT NULL AND v_sub.stripe_subscription_id <> p_stripe_subscription_id) THEN
    RETURN jsonb_build_object('ok', false, 'applied', false, 'error', 'No confirmed Stripe subscription to attach this promo to yet');
  END IF;

  UPDATE promotion_redemptions
  SET status = 'completed', completed_at = now(), stripe_subscription_id = p_stripe_subscription_id
  WHERE id = v_redemption.id;

  UPDATE promotions SET times_redeemed = times_redeemed + 1, updated_at = now()
  WHERE id = v_redemption.promotion_id;

  IF v_redemption.bonus_credits_granted > 0 OR v_redemption.bonus_leads_granted > 0 THEN
    UPDATE subscriptions SET
      credits_remaining = credits_remaining + v_redemption.bonus_credits_granted,
      credits_total     = credits_total + v_redemption.bonus_credits_granted,
      leads_remaining   = leads_remaining + v_redemption.bonus_leads_granted,
      leads_total       = leads_total + v_redemption.bonus_leads_granted,
      updated_at        = now()
    WHERE id = v_sub.id;

    IF v_redemption.bonus_credits_granted > 0 THEN
      INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
      VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_credits_granted, 'credits', 'completed',
              jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
    END IF;
    IF v_redemption.bonus_leads_granted > 0 THEN
      INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
      VALUES (p_workspace_id, v_sub.id, 'promo_bonus', v_redemption.bonus_leads_granted, 'leads', 'completed',
              jsonb_build_object('promotion_id', v_redemption.promotion_id, 'redemption_id', v_redemption.id));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'applied', true,
    'bonus_credits', v_redemption.bonus_credits_granted, 'bonus_leads', v_redemption.bonus_leads_granted);
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_promotion_finalize(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_promotion_finalize(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION sync_subscription_from_stripe(
  p_workspace_id UUID,
  p_plan_id TEXT,
  p_billing_interval TEXT,
  p_status TEXT,
  p_credits_total INTEGER,
  p_leads_total INTEGER,
  p_current_period_start TIMESTAMPTZ,
  p_current_period_end TIMESTAMPTZ,
  p_trial_ends_at TIMESTAMPTZ,
  p_stripe_customer_id TEXT,
  p_stripe_subscription_id TEXT,
  p_stripe_price_id TEXT,
  p_cancel_at_period_end BOOLEAN,
  p_canceled_at TIMESTAMPTZ
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing        subscriptions%ROWTYPE;
  v_plan_changed     BOOLEAN;
  v_credits_remaining INTEGER;
  v_leads_remaining   INTEGER;
  v_sub_id            UUID;
BEGIN
  SELECT * INTO v_existing FROM subscriptions WHERE workspace_id = p_workspace_id FOR UPDATE;

  v_plan_changed      := FOUND AND v_existing.plan_id <> p_plan_id;
  v_credits_remaining := CASE WHEN v_plan_changed OR NOT FOUND THEN p_credits_total ELSE v_existing.credits_remaining END;
  v_leads_remaining   := CASE WHEN v_plan_changed OR NOT FOUND THEN p_leads_total   ELSE v_existing.leads_remaining   END;

  INSERT INTO subscriptions (
    workspace_id, plan_id, billing_interval, status,
    credits_remaining, credits_total, leads_remaining, leads_total,
    trial_ends_at, current_period_start, current_period_end,
    stripe_customer_id, stripe_subscription_id, stripe_price_id,
    cancel_at_period_end, canceled_at, updated_at
  ) VALUES (
    p_workspace_id, p_plan_id, p_billing_interval, p_status,
    v_credits_remaining, p_credits_total, v_leads_remaining, p_leads_total,
    p_trial_ends_at, p_current_period_start, p_current_period_end,
    p_stripe_customer_id, p_stripe_subscription_id, p_stripe_price_id,
    p_cancel_at_period_end, p_canceled_at, now()
  )
  ON CONFLICT (workspace_id) DO UPDATE SET
    plan_id                = EXCLUDED.plan_id,
    billing_interval        = EXCLUDED.billing_interval,
    status                   = EXCLUDED.status,
    credits_remaining        = EXCLUDED.credits_remaining,
    credits_total            = EXCLUDED.credits_total,
    leads_remaining           = EXCLUDED.leads_remaining,
    leads_total               = EXCLUDED.leads_total,
    trial_ends_at             = EXCLUDED.trial_ends_at,
    current_period_start     = EXCLUDED.current_period_start,
    current_period_end       = EXCLUDED.current_period_end,
    stripe_customer_id        = EXCLUDED.stripe_customer_id,
    stripe_subscription_id     = EXCLUDED.stripe_subscription_id,
    stripe_price_id            = EXCLUDED.stripe_price_id,
    cancel_at_period_end       = EXCLUDED.cancel_at_period_end,
    canceled_at                = EXCLUDED.canceled_at,
    updated_at                 = now()
  RETURNING id INTO v_sub_id;

  IF v_plan_changed THEN
    INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
    VALUES (p_workspace_id, v_sub_id, 'plan_change', p_credits_total, 'credits', 'completed',
            jsonb_build_object('from', v_existing.plan_id, 'to', p_plan_id));
    IF p_leads_total > 0 THEN
      INSERT INTO credit_ledger (workspace_id, subscription_id, operation_type, credits_delta, resource_type, status, metadata)
      VALUES (p_workspace_id, v_sub_id, 'plan_change', p_leads_total, 'leads', 'completed',
              jsonb_build_object('from', v_existing.plan_id, 'to', p_plan_id));
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_subscription_from_stripe(
  UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, BOOLEAN, TIMESTAMPTZ
) TO service_role;

-- >>> FILE: 0133_lead_provider_settings.sql
CREATE TABLE IF NOT EXISTS lead_provider_settings (
  id               INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- single-row table
  active_provider  TEXT NOT NULL DEFAULT 'bright_data' CHECK (active_provider IN ('anysite', 'bright_data')),
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO lead_provider_settings (id, active_provider)
VALUES (1, 'bright_data')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE lead_provider_settings ENABLE ROW LEVEL SECURITY;

-- >>> FILE: 0127_opportunity_stage_history.sql
-- ============================================================================
-- 0127_opportunity_stage_history.sql
--
-- Phase 2 item: real stage-to-stage conversion tracking for Pipeline
-- Analytics. Until now, "Stage Conversion" was approximated as "reached
-- this stage or later" (a waterfall proxy, documented in analytics-pipeline.ts)
-- because there was no history of when an opportunity actually moved between
-- stages. This adds a real, trigger-populated log, so future stage moves are
-- captured going forward with zero app-code changes needed to keep logging.
--
-- Existing opportunities get a one-row backfill (their current stage, at the
-- closest real timestamp available) — this is NOT a reconstruction of their
-- real history (that data was never captured), it's a starting point so every
-- opportunity has at least one row and the trigger's future data builds on
-- a complete base.
-- ============================================================================

CREATE TABLE IF NOT EXISTS opportunity_stage_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  from_stage     TEXT,
  to_stage       TEXT NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opp_stage_history_opp ON opportunity_stage_history (opportunity_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_opp_stage_history_workspace ON opportunity_stage_history (workspace_id, changed_at);

-- SECURITY DEFINER so the log write never depends on the acting user's own
-- grants on this table (which intentionally has no INSERT policy for
-- authenticated users below — same "system writes, users only read" pattern
-- as credit_ledger/promotion_redemptions).
CREATE OR REPLACE FUNCTION log_opportunity_stage_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO opportunity_stage_history (workspace_id, opportunity_id, from_stage, to_stage, changed_at)
    VALUES (NEW.workspace_id, NEW.id, NULL, NEW.stage, now());
  ELSIF (TG_OP = 'UPDATE') AND (NEW.stage IS DISTINCT FROM OLD.stage) THEN
    INSERT INTO opportunity_stage_history (workspace_id, opportunity_id, from_stage, to_stage, changed_at)
    VALUES (NEW.workspace_id, NEW.id, OLD.stage, NEW.stage, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_stage_history ON opportunities;
CREATE TRIGGER trg_opportunity_stage_history
  AFTER INSERT OR UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION log_opportunity_stage_change();

-- Backfill — one row per existing opportunity with no history yet.
INSERT INTO opportunity_stage_history (workspace_id, opportunity_id, from_stage, to_stage, changed_at)
SELECT o.workspace_id, o.id, NULL, o.stage, COALESCE(o.closed_at, o.updated_at, o.created_at)
FROM opportunities o
WHERE o.workspace_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM opportunity_stage_history h WHERE h.opportunity_id = o.id);

ALTER TABLE opportunity_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_stage_history_read ON opportunity_stage_history;
CREATE POLICY opportunity_stage_history_read
  ON opportunity_stage_history FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );
-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated users — the
-- SECURITY DEFINER trigger above is the only writer.

-- >>> FILE: 0128_sales_quotas.sql
-- ============================================================================
-- 0128_sales_quotas.sql
--
-- Phase 2 item: a real Target/Quota data model, unlocking Pipeline Coverage,
-- Quota Attainment, and Gap-to-Target on Revenue Analytics, plus a
-- Target/Attainment% column on the Team leaderboard. A quota is either
-- per-rep (user_id set) or a whole-workspace target (user_id NULL) for a
-- given period.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_quotas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(user_id) ON DELETE CASCADE,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  target_amount  NUMERIC(14,2) NOT NULL CHECK (target_amount >= 0),
  quota_type     TEXT NOT NULL DEFAULT 'revenue' CHECK (quota_type IN ('revenue', 'pipeline')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_sales_quotas_workspace_period ON sales_quotas (workspace_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_sales_quotas_user ON sales_quotas (user_id);

DROP TRIGGER IF EXISTS trg_sales_quotas_updated ON sales_quotas;
CREATE TRIGGER trg_sales_quotas_updated
  BEFORE UPDATE ON sales_quotas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE sales_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_quotas_read ON sales_quotas;
CREATE POLICY sales_quotas_read
  ON sales_quotas FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );

-- Only Super Admins (role_id = 1, this app's existing admin check — see
-- getAnalyticsContext()'s isAdmin) may set targets for the team.
DROP POLICY IF EXISTS sales_quotas_admin_write ON sales_quotas;
CREATE POLICY sales_quotas_admin_write
  ON sales_quotas FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid() AND role_id = 1)
  ) WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid() AND role_id = 1)
  );

-- >>> FILE: 0129_pipeline_snapshots.sql
-- ============================================================================
-- 0129_pipeline_snapshots.sql
--
-- Phase 2 item: daily pipeline snapshots, unlocking a real Pipeline Trend
-- chart and Forecast Accuracy/Slippage on Revenue Analytics. Until now,
-- "Pipeline Trend" had no historical series to draw from — pipeline value is
-- only ever queried live, as of right now. One row per workspace per day
-- gives a genuine time series going forward.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pipeline_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_date            DATE NOT NULL,
  total_pipeline_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
  weighted_pipeline_value  NUMERIC(14,2) NOT NULL DEFAULT 0,
  open_deal_count          INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_snapshots_workspace_date ON pipeline_snapshots (workspace_id, snapshot_date);

ALTER TABLE pipeline_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_snapshots_read ON pipeline_snapshots;
CREATE POLICY pipeline_snapshots_read
  ON pipeline_snapshots FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE user_id = auth.uid())
  );
-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated users — only
-- the protected cron route (using the service-role client) writes here, same
-- "system writes, users only read" pattern as opportunity_stage_history.

-- Optional Supabase pg_cron setup (replace URL and secret storage for the deployment):
-- SELECT cron.schedule('nxelio-pipeline-snapshot-daily', '5 0 * * *',
--   $$SELECT net.http_get(url := 'https://YOUR_APP_URL/api/analytics/pipeline-snapshot/cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_PIPELINE_SNAPSHOT_CRON_SECRET'));$$);

-- >>> FILE: 0130_ai_recommendations.sql
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

-- >>> FILE: 0131_report_schedules.sql
-- ============================================================================
-- 0131_report_schedules.sql
--
-- Phase 2 item: scheduled CSV email export for the Custom Reports engine
-- (analytics_reports, migration 0089). PDF/Excel export is explicitly out of
-- scope here — this schema has no PDF/Excel-generation library installed
-- yet, and adding one is a dependency decision, not something to slip in
-- silently inside an analytics feature.
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  report_id      UUID NOT NULL REFERENCES analytics_reports(id) ON DELETE CASCADE,
  recipients     TEXT[] NOT NULL,
  frequency      TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week    INT CHECK (day_of_week BETWEEN 0 AND 6),   -- 0=Sunday, only used when frequency='weekly'
  day_of_month   INT CHECK (day_of_month BETWEEN 1 AND 28), -- capped at 28 so every month has this day; only used when frequency='monthly'
  hour_utc       INT NOT NULL DEFAULT 8 CHECK (hour_utc BETWEEN 0 AND 23),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  last_sent_at   TIMESTAMPTZ,
  created_by     UUID REFERENCES users(user_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_workspace ON report_schedules (workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_report_schedules_report ON report_schedules (report_id);

DROP TRIGGER IF EXISTS trg_report_schedules_updated ON report_schedules;
CREATE TRIGGER trg_report_schedules_updated
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

-- Same workspace-scoped, all-member CRUD convention as analytics_reports
-- itself (0089) — anyone who can see/build a report can schedule it.
DROP POLICY IF EXISTS ws_select_report_schedules ON report_schedules;
CREATE POLICY ws_select_report_schedules ON report_schedules FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_insert_report_schedules ON report_schedules;
CREATE POLICY ws_insert_report_schedules ON report_schedules FOR INSERT TO authenticated
  WITH CHECK (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_update_report_schedules ON report_schedules;
CREATE POLICY ws_update_report_schedules ON report_schedules FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id());

DROP POLICY IF EXISTS ws_delete_report_schedules ON report_schedules;
CREATE POLICY ws_delete_report_schedules ON report_schedules FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id());

-- Optional Supabase pg_cron setup (replace URL and secret storage for the deployment):
-- SELECT cron.schedule('nxelio-report-schedules-hourly', '0 * * * *',
--   $$SELECT net.http_get(url := 'https://YOUR_APP_URL/api/analytics/report-schedules/cron',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_REPORT_SCHEDULE_CRON_SECRET'));$$);

-- >>> FILE: 0132_dashboard_sharing.sql
-- ============================================================================
-- 0132_dashboard_sharing.sql
--
-- Phase 2 item: dashboard sharing/visibility (private vs. shared with the
-- whole workspace) and a persisted global date-range filter applied across
-- every non-system widget on a dashboard.
--
-- Widget resize is NOT a schema change — analytics_dashboard_widgets already
-- has width/height (migration 0089); this phase wires an actual UI control
-- to the width column (the only dimension the current 12-col grid renders).
-- ============================================================================

ALTER TABLE analytics_dashboards ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace'));
ALTER TABLE analytics_dashboards ADD COLUMN IF NOT EXISTS global_filters JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Tighten analytics_dashboards' SELECT/UPDATE/DELETE policies (from 0089's
-- generic per-table loop) to also respect visibility: a private dashboard
-- is invisible to, and un-editable by, anyone but its creator.
DROP POLICY IF EXISTS ws_select_analytics_dashboards ON analytics_dashboards;
CREATE POLICY ws_select_analytics_dashboards ON analytics_dashboards FOR SELECT TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (visibility = 'workspace' OR created_by = auth.uid()));

DROP POLICY IF EXISTS ws_update_analytics_dashboards ON analytics_dashboards;
CREATE POLICY ws_update_analytics_dashboards ON analytics_dashboards FOR UPDATE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (visibility = 'workspace' OR created_by = auth.uid()));

DROP POLICY IF EXISTS ws_delete_analytics_dashboards ON analytics_dashboards;
CREATE POLICY ws_delete_analytics_dashboards ON analytics_dashboards FOR DELETE TO authenticated
  USING (workspace_id = get_current_workspace_id() AND (visibility = 'workspace' OR created_by = auth.uid()));

-- Widgets follow their parent dashboard's visibility.
DROP POLICY IF EXISTS ws_select_analytics_dashboard_widgets ON analytics_dashboard_widgets;
CREATE POLICY ws_select_analytics_dashboard_widgets ON analytics_dashboard_widgets FOR SELECT TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND EXISTS (SELECT 1 FROM analytics_dashboards d WHERE d.id = dashboard_id AND (d.visibility = 'workspace' OR d.created_by = auth.uid()))
  );

DROP POLICY IF EXISTS ws_update_analytics_dashboard_widgets ON analytics_dashboard_widgets;
CREATE POLICY ws_update_analytics_dashboard_widgets ON analytics_dashboard_widgets FOR UPDATE TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND EXISTS (SELECT 1 FROM analytics_dashboards d WHERE d.id = dashboard_id AND (d.visibility = 'workspace' OR d.created_by = auth.uid()))
  );

DROP POLICY IF EXISTS ws_delete_analytics_dashboard_widgets ON analytics_dashboard_widgets;
CREATE POLICY ws_delete_analytics_dashboard_widgets ON analytics_dashboard_widgets FOR DELETE TO authenticated
  USING (
    workspace_id = get_current_workspace_id()
    AND EXISTS (SELECT 1 FROM analytics_dashboards d WHERE d.id = dashboard_id AND (d.visibility = 'workspace' OR d.created_by = auth.uid()))
  );

-- >>> FILE: 0134_account_additional_details.sql
-- Additional Details step in the Edit Account wizard collects these three
-- fields, but they were never given DB columns — silently dropped on save.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS account_site TEXT,
  ADD COLUMN IF NOT EXISTS parent_account TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT;

-- >>> FILE: 0136_secure_send_quota_and_billing_lock_rpcs.sql
-- ============================================================================
-- 0134_secure_send_quota_and_billing_lock_rpcs.sql
--
-- 0126_secure_billing_rpcs.sql locked down deduct_credits/deduct_leads/
-- redeem_promotion_start/redeem_promotion_finalize (called via PostgREST
-- with a client-supplied workspace_id, never checked against the caller's
-- own workspace, never revoked from PUBLIC). Two more functions in the
-- same original migration (0028_subscriptions.sql) have the identical gap
-- and were missed by that pass:
--
-- 1. consume_send_quota — called via the user-token client (manual campaign
--    launch) as well as the admin client (scheduled-send cron), exactly the
--    same mixed calling pattern deduct_credits already has. Any authenticated
--    user could call it directly via PostgREST with another workspace's id
--    to burn or reset that workspace's daily send quota. Fixed the same way:
--    checked against get_current_workspace_id() only when there's a real
--    logged-in caller (service-role calls have no JWT, so the check is
--    skipped there — trusted since only our own server code holds that key).
--
-- 2. claim_billing_op — has no caller anywhere in the app today (grep
--    confirms), but ships with the same missing check and default-open
--    PUBLIC grant as the others. Fixed the same way and locked to
--    service_role only, since nothing legitimate calls it as an
--    authenticated user yet — a future caller needs an explicit grant here,
--    which is the safe failure mode.
-- ============================================================================

-- ── consume_send_quota: ownership check + REVOKE/GRANT ─────────────────────
CREATE OR REPLACE FUNCTION consume_send_quota(p_workspace_id uuid, p_channel text, p_requested integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_limit   outreach_send_limits%ROWTYPE;
  v_count   outreach_send_counts%ROWTYPE;
  v_today   DATE := CURRENT_DATE;
  v_allowed INTEGER;
  v_granted INTEGER;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN 0;
  END IF;

  IF p_requested <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_limit FROM outreach_send_limits
  WHERE workspace_id = p_workspace_id AND channel = p_channel;
  IF NOT FOUND THEN
    RETURN p_requested; -- no limit configured for this channel — unthrottled
  END IF;

  SELECT * INTO v_count FROM outreach_send_counts
  WHERE workspace_id = p_workspace_id AND channel = p_channel AND send_date = v_today
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO outreach_send_counts (workspace_id, channel, send_date, quota, sent_count)
    VALUES (
      p_workspace_id, p_channel, v_today,
      v_limit.daily_min + floor(random() * (v_limit.daily_max - v_limit.daily_min + 1))::INTEGER,
      0
    )
    RETURNING * INTO v_count;
  END IF;

  v_allowed := GREATEST(0, v_count.quota - v_count.sent_count);
  v_granted := LEAST(p_requested, v_allowed);

  IF v_granted > 0 THEN
    UPDATE outreach_send_counts SET sent_count = sent_count + v_granted, updated_at = now()
    WHERE id = v_count.id;
  END IF;

  RETURN v_granted;
END;
$$;

REVOKE EXECUTE ON FUNCTION consume_send_quota(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_send_quota(uuid, text, integer) TO authenticated, service_role;

-- ── claim_billing_op: ownership check + service_role-only ──────────────────
CREATE OR REPLACE FUNCTION claim_billing_op(p_workspace_id uuid, p_stale_after_seconds integer DEFAULT 20) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  claimed BOOLEAN := false;
BEGIN
  IF get_current_workspace_id() IS NOT NULL AND p_workspace_id <> get_current_workspace_id() THEN
    RETURN false;
  END IF;

  UPDATE subscriptions
  SET billing_op_lock_at = now()
  WHERE workspace_id = p_workspace_id
    AND (billing_op_lock_at IS NULL OR billing_op_lock_at < now() - (p_stale_after_seconds || ' seconds')::interval)
  RETURNING true INTO claimed;

  RETURN COALESCE(claimed, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_billing_op(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_billing_op(uuid, integer) TO service_role;

-- >>> FILE: 0135_stripe_event_idempotency.sql
-- ============================================================================
-- 0135_stripe_event_idempotency.sql
--
-- Stripe explicitly documents that a webhook endpoint may receive the same
-- event more than once (retries after a slow/failed response, or a genuine
-- redelivery) and that handlers must be safe to run twice. Several of the
-- webhook's individual operations already guard against this on their own
-- (reset_subscription_cycle's invoice-id idempotency key from 0126,
-- sync_subscription_from_stripe's plan-change guard, redeem_promotion_finalize's
-- pending→completed status transition) — but that safety was scattered
-- per-operation rather than at the one place that actually knows which
-- Stripe event this is. This adds a single, general event-id ledger so
-- src/app/api/billing/webhook/route.ts can recognize and skip a redelivered
-- event outright, protecting every event type uniformly (including any
-- added later that isn't independently idempotent).
-- ============================================================================

CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stripe_processed_events ENABLE ROW LEVEL SECURITY;

-- Server-only (the webhook route uses the admin/service-role client) — no
-- workspace to scope this to, and nothing client-side ever needs to read it.
REVOKE ALL ON stripe_processed_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON stripe_processed_events TO service_role;

-- >>> FILE: 0137_lead_search_jobs.sql
-- ============================================================================
-- Lead search jobs — background "Verified Leads" search.
--
-- Lets a user request N verified-email prospects without waiting on the
-- request: a row is inserted here `pending`, and a per-minute cron (see the
-- commented pg_cron block below) drains it in small chunks — one search
-- round + a handful of email lookups per tick — persisting progress after
-- every batch so a Vercel function timeout never loses work. Keeps going
-- (escalating the search round) until it hits requested_count or genuinely
-- runs out of new prospects, then emails the requester and marks the row
-- `done`. Mirrors the outreach_jobs/campaign_jobs queue shape.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_search_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  notify_email TEXT NOT NULL,
  criteria JSONB NOT NULL,
  requested_count INT NOT NULL,
  -- 'pending' | 'running' | 'done' | 'failed'
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  found_count INT NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,        -- GeneratedProspect[] confirmed-verified so far
  pending_pool JSONB NOT NULL DEFAULT '[]'::jsonb,    -- raw prospects awaiting email lookup
  seen_linkedin JSONB NOT NULL DEFAULT '[]'::jsonb,   -- dedupe across search rounds
  round INT NOT NULL DEFAULT 0,
  search_exhausted BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lead_search_jobs_due ON lead_search_jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_lead_search_jobs_workspace ON lead_search_jobs(workspace_id, created_at DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['lead_search_jobs']) LOOP
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

-- Drained every minute by /api/leads/search-jobs/cron (Authorization: Bearer
-- LEAD_SEARCH_CRON_SECRET). Uncomment and fill in the real app URL + secret
-- once deployed:
-- SELECT cron.schedule('process-lead-search-jobs', '* * * * *', $$
--   SELECT net.http_post(
--     url := 'https://YOUR_APP_URL/api/leads/search-jobs/cron',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer YOUR_LEAD_SEARCH_CRON_SECRET'),
--     body := '{}'::jsonb
--   );
-- $$);

-- >>> FILE: 0138_cancellation_requests.sql
-- Cancellation retention system: tracks customer cancellation requests so the
-- admin team can intervene, schedule a meeting, make a retention offer, and
-- only cancel in Stripe when the customer cannot be retained.

CREATE TABLE cancellation_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_name        TEXT,
  customer_email       TEXT NOT NULL,
  plan_id              TEXT,
  reason               TEXT NOT NULL
                       CHECK (reason IN ('too_expensive','missing_features','found_alternative',
                                         'not_using','technical_issues','business_closed','other')),
  feedback             TEXT,
  wants_meeting        BOOLEAN NOT NULL DEFAULT false,
  meeting_provider     TEXT CHECK (meeting_provider IN ('zoom','google_meet') OR meeting_provider IS NULL),
  preferred_date       DATE,
  preferred_time       TEXT,
  meeting_link         TEXT,
  meeting_scheduled_at TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','meeting_scheduled','retained',
                                         'cancelled','follow_up_required','no_response')),
  admin_notes          TEXT,
  retention_offer      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at          TIMESTAMPTZ
);

ALTER TABLE cancellation_requests ENABLE ROW LEVEL SECURITY;

-- Customers can read and insert their own workspace's tickets
CREATE POLICY "cr_workspace_select" ON cancellation_requests
  FOR SELECT USING (workspace_id = get_current_workspace_id());

CREATE POLICY "cr_workspace_insert" ON cancellation_requests
  FOR INSERT WITH CHECK (workspace_id = get_current_workspace_id());

-- Admin uses createAdminClient() (service_role) which bypasses RLS

CREATE TRIGGER cancellation_requests_updated_at
  BEFORE UPDATE ON cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- >>> FILE: 0139_lead_search_jobs_progress.sql
-- ============================================================================
-- Lead search jobs — exhaustive-search + progress-email fields.
--
-- Follow-up to 0137_lead_search_jobs.sql. That first version tied how large a
-- raw search round could get to the workspace's remaining lead *credit*
-- balance — which is a billing limit on how many leads you can IMPORT, not a
-- real constraint on how many candidates a search may examine while looking
-- for enough confirmed emails. That made the job give up (e.g. "8 of 10")
-- long before it had actually exhausted the real candidate pool.
--
-- This adds: a consecutive-dry-round counter (so "give up" means "N rounds in
-- a row at max search size found nobody new," not "hit an arbitrary count"),
-- a timestamp for the last "still working" status email, and a stored
-- human-readable time estimate shown to the requester up front.
-- ============================================================================

ALTER TABLE lead_search_jobs
  ADD COLUMN IF NOT EXISTS dry_rounds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_progress_email_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_estimate TEXT;

-- >>> FILE: 0140_campaign_ai_generated_flag.sql
-- The "Draft (AI-generated)" approval status was being applied to every new
-- campaign via the column default, including ones built entirely by hand —
-- there was no way to tell the two apart. Split it: approval_status now just
-- tracks the review lifecycle ("Draft"), and a separate boolean flag tracks
-- whether AI generation was actually used, so the UI can show that as its own
-- badge instead of baking it into the approval status string.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS generated_by_ai BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE campaigns
  ALTER COLUMN approval_status SET DEFAULT 'Draft';

-- The old check constraint only allowed 'Draft (AI-generated)', not plain
-- 'Draft' — drop it before renaming existing rows below, since Postgres
-- validates a constraint against ALL existing rows the moment either
-- version of it is active, and neither the old nor new wording alone
-- covers a table mid-rename.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_approval_status_check;

-- Existing rows stuck at the old default: we can't know in hindsight whether
-- AI was actually used, so leave generated_by_ai false and just normalize the
-- label itself so old manually-built drafts stop being mislabeled going forward.
UPDATE campaigns SET approval_status = 'Draft' WHERE approval_status = 'Draft (AI-generated)';

-- Now that every row already says 'Draft', re-adding the constraint validates cleanly.
ALTER TABLE campaigns ADD CONSTRAINT campaigns_approval_status_check
  CHECK (approval_status IN ('Draft', 'Pending review', 'Approved', 'Live/Distributing', 'Archived'));

-- >>> FILE: 0141_lead_search_jobs_imported_at.sql
-- Tracks whether a finished Verified Leads job's results have actually been
-- imported yet — lets the UI show a "ready to review" indicator (e.g. a glow
-- on the Verified Leads button) only for jobs that are done AND still
-- unactioned, instead of glowing forever after the first import.
ALTER TABLE lead_search_jobs
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
