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
