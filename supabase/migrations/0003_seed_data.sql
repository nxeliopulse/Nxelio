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
