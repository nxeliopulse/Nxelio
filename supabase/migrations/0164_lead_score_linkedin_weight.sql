-- Bumps the LinkedIn contact-completeness weight from 8 to 10 (now equal to
-- email/phone) — see calculate_lead_score() in migration 0163.

CREATE OR REPLACE FUNCTION calculate_lead_score(l leads) RETURNS INT AS $$
DECLARE
  contact_pts INT := 0;
  source_pts  INT := 0;
  engage_pts  INT := 0;
  total INT;
  src TEXT := lower(coalesce(l.source, ''));
BEGIN
  -- Contact completeness (max 37)
  IF l.email IS NOT NULL AND l.email <> '' THEN contact_pts := contact_pts + 10; END IF;
  IF l.phone IS NOT NULL AND l.phone <> '' THEN contact_pts := contact_pts + 10; END IF;
  IF l.linkedin IS NOT NULL AND l.linkedin <> '' THEN contact_pts := contact_pts + 10; END IF;
  IF l.website_url IS NOT NULL AND l.website_url <> '' THEN contact_pts := contact_pts + 7; END IF;

  -- Source quality (max 25)
  IF src IN ('booking link', 'public capture form') THEN
    source_pts := 25; -- inbound, human-initiated
  ELSIF src IN ('manual entry', 'verified emails', 'ai assistant') THEN
    source_pts := 15; -- curated / hand-picked
  ELSIF src IN ('csv upload', 'linkedin search', 'linkedin post', 'buy leads', 'company-wise leads', 'import') THEN
    source_pts := 8;  -- bulk / cold-sourced
  ELSE
    source_pts := 5;  -- unknown source
  END IF;

  -- Status + verification (max 40)
  engage_pts := CASE l.status
    WHEN 'Converted'  THEN 30
    WHEN 'Qualified'  THEN 25
    WHEN 'Nurturing'  THEN 15
    WHEN 'Contacted'  THEN 10
    ELSE 0
  END;
  IF l.verified THEN engage_pts := engage_pts + 10; END IF;

  total := LEAST(100, GREATEST(0, contact_pts + source_pts + engage_pts));

  -- Penalties override everything else
  IF l.do_not_contact OR l.email_opt_out THEN
    RETURN 0;
  ELSIF l.email_bounced THEN
    RETURN LEAST(total, 10);
  END IF;

  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recalculate every existing lead with the updated weight.
UPDATE leads SET lead_score = calculate_lead_score(leads);
