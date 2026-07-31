-- Lead Conversion workflow: converting a Lead creates/links a real Account +
-- Contact + optional Opportunity, and the Lead keeps a permanent record of
-- what it became (never deleted).

-- Contacts didn't have a linkedin field (Leads already do) — needed so the
-- conversion modal's duplicate-contact matching can check it.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin VARCHAR(500);

-- Opportunities only had a denormalized company/contact_name/contact_email
-- snapshot — add real FKs so a converted lead's deal actually links to the
-- Account/Contact records instead of just free text.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON opportunities(contact_id);

-- The lead itself keeps permanent links to whatever it converted into.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_converted_account_id ON leads(converted_account_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted_contact_id ON leads(converted_contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_converted_opportunity_id ON leads(converted_opportunity_id);
