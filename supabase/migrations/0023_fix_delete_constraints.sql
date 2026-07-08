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
