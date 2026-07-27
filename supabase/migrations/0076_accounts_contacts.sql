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
