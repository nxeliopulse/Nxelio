-- Company-wise Buy Leads: when a lead is discovered via the new "find
-- companies first" flow, it already has a known/matched Account before the
-- lead is ever manually Converted. Deliberately a SEPARATE column from
-- converted_account_id (which means "this lead WAS converted into this
-- account") — discovered_account_id just means "this lead was sourced from
-- this company," and getConversionMatches() can use it later to skip
-- re-matching by name/website at Convert time.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS discovered_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_discovered_account ON leads(discovered_account_id);
