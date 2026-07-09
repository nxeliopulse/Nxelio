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
