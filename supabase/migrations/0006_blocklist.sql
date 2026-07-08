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
