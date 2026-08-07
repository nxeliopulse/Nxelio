-- Segment rule versioning table for recording saved rule tree snapshots
CREATE TABLE IF NOT EXISTS public.segment_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  rule_json JSONB NOT NULL,
  version_label TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segment_versions_segment_id ON public.segment_versions(segment_id);

-- Segment sharing table
CREATE TABLE IF NOT EXISTS public.segment_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('user', 'team')),
  grantee_id TEXT NOT NULL,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('view', 'edit')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(segment_id, grantee_type, grantee_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_shares_segment_id ON public.segment_shares(segment_id);

-- Enable RLS
ALTER TABLE public.segment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read segment versions" ON public.segment_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users insert segment versions" ON public.segment_versions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users read segment shares" ON public.segment_shares FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users modify segment shares" ON public.segment_shares FOR ALL TO authenticated USING (true);
