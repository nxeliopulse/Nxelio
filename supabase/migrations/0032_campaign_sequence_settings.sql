-- ============================================================================
-- Campaign builder settings surfaced in the redesigned Sequence tab:
--   - content_is_html: the step bodies are rich-text (HTML) rather than plain
--     text, so the sender knows to render/send them as HTML.
--   - pause_same_company_on_reply: when a lead replies, also pause remaining
--     steps for OTHER leads at the same email domain (not just that lead).
-- ============================================================================

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_is_html BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pause_same_company_on_reply BOOLEAN NOT NULL DEFAULT false;
