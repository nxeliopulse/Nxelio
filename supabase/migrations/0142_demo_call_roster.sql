-- ============================================================================
-- 0136 — Demo call roster: which reps can take a landing-page demo call, and
-- which one is "live" (the one who actually takes it) for each bookable time
-- slot. Platform-admin only, same access pattern as demo_requests (0058):
-- RLS enabled with NO policies => only the service role can read/write.
-- ============================================================================

CREATE TABLE IF NOT EXISTS demo_call_people (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  designation  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS demo_call_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_date   DATE NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per (slot, person) — every person in the roster is a togglable
-- candidate for every slot. `is_live` marks who actually takes calls booked
-- in that slot; the partial unique index below enforces at most one live
-- person per slot at the database level, regardless of application bugs.
CREATE TABLE IF NOT EXISTS demo_call_slot_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id     UUID NOT NULL REFERENCES demo_call_slots(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES demo_call_people(id) ON DELETE CASCADE,
  is_live     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, person_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_call_slot_one_live
  ON demo_call_slot_assignments (slot_id) WHERE is_live;

CREATE INDEX IF NOT EXISTS idx_demo_call_slots_date ON demo_call_slots (slot_date, start_time);
CREATE INDEX IF NOT EXISTS idx_demo_call_slot_assignments_slot ON demo_call_slot_assignments (slot_id);

ALTER TABLE demo_call_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_call_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_call_slot_assignments ENABLE ROW LEVEL SECURITY;
