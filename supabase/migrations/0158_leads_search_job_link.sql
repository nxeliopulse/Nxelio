-- Links a lead back to the background Buy Leads search (lead_search_jobs)
-- it was imported from, if any — powers the Prospects table's "Group" view
-- (group by the search batch a lead was bought in). NULL for every other
-- source (manual entry, CSV, Company-wise Leads, the instant "Search now"
-- Buy Leads path, and all pre-existing leads) — those all fall into a single
-- "Added manually" catch-all group client-side, no data needed for that.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS search_job_id UUID REFERENCES lead_search_jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_search_job_id_idx ON leads(search_job_id);
