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
