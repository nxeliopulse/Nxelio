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
