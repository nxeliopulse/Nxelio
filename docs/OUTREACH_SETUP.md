# Outreach — going fully real

The Outreach engine (sequences, the job queue, the processor, reply handling) is
built into the app. To make it actually send to real prospects you need to plug
in **three external things**: a Unipile account, the env vars below, and the
Supabase cron job. Until then the app still runs — email falls back to Resend
(sandbox) and LinkedIn steps fail with a clear "not configured" message.

## 1. Run the migrations

Apply these in the Supabase SQL editor (in order):

- `supabase/migrations/0016_outreach.sql` — sequences, steps, enrollments, activities
- `supabase/migrations/0017_outreach_real.sql` — accounts + job queue + (commented) cron

## 2. Environment variables

Add to `.env.local` (and your production env):

```bash
# --- Unipile (one provider for Gmail/Outlook email + LinkedIn) ---
UNIPILE_DSN=https://apiXX.unipile.com:XXXXX     # from your Unipile dashboard
UNIPILE_API_KEY=your_unipile_api_key
UNIPILE_WEBHOOK_SECRET=any_long_random_string   # you choose this

# --- App URL (used for OAuth redirects + cron) ---
NEXT_PUBLIC_APP_URL=https://your-deployed-app.com   # http://localhost:3000 in dev

# --- Cron auth (you choose this) ---
OUTREACH_CRON_SECRET=any_long_random_string

# --- Service role (already used elsewhere; required by the processor) ---
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# --- Optional email fallback before Unipile is connected ---
RESEND_API_KEY=...
EMAIL_TEST_RECIPIENT=you@example.com
```

## 3. Sign up for Unipile & connect accounts

1. Create an account at https://www.unipile.com and copy your **DSN** + **API key**.
2. In the app: **Outreach → LinkedIn Accounts / Email Accounts → Connect**.
   This opens Unipile's hosted auth wizard; the user authorizes their Gmail/Outlook
   or LinkedIn, and is redirected back. We then sync the account into the DB.

## 4. Configure the reply webhook (in Unipile)

Point Unipile's messaging webhook at:

```
https://YOUR_APP_URL/api/unipile/webhook?secret=YOUR_UNIPILE_WEBHOOK_SECRET
```

When a lead replies (email or LinkedIn), this stops their sequence, counts the
reply, logs it, and drops the message into the Inbox.

## 5. Schedule the processor (Supabase pg_cron)

In Supabase: **Database → Extensions** → enable `pg_cron` and `pg_net`.
Then run the block at the bottom of `0017_outreach_real.sql`, with the two
placeholders filled in:

```sql
SELECT cron.schedule(
  'process-outreach',
  '* * * * *',  -- every minute
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_APP_URL/api/outreach/cron',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer YOUR_OUTREACH_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

This pings the cron route every minute, which drains due jobs: sends each step,
then schedules the next step at its `delay_days`.

## How it flows

```
Enroll leads ─► enrollment + step-1 job (run_at = now)
                     │  (step 1 also runs inline for instant feedback)
                     ▼
pg_cron every minute ─► /api/outreach/cron ─► processDueJobs()
                     │     send via Unipile (email/LinkedIn) or Resend fallback
                     │     log activity, bump counters
                     ▼     schedule next step at +delay_days
              ...repeats until last step (enrollment = completed)

Lead replies ─► Unipile webhook ─► stop enrollment + cancel pending jobs + count reply
```

## Test checklist

- [ ] Migrations applied
- [ ] Env vars set, dev server restarted
- [ ] Connected at least one email and/or LinkedIn account (Accounts tabs show "connected")
- [ ] Built a sequence, enrolled a test lead (use your own email / a test LinkedIn profile)
- [ ] First step arrives; `outreach_activities` shows `sent`
- [ ] Wait for cron (or `curl -H "Authorization: Bearer <secret>" $APP_URL/api/outreach/cron`) → next step sends after its delay
- [ ] Reply to the message → sequence stops, reply counted
