// Logs every seeded load-test account in through the REAL username/password
// flow (supabase.auth.signInWithPassword — the exact call the login page
// makes) and captures the resulting session cookies, using this app's own
// @supabase/ssr dependency so the cookie names/format are guaranteed to
// match what the running app actually expects — no bypass, no hand-rolled
// token, just automating the normal login step for accounts created by
// seed-load-test-users.mjs.
//
// Usage:
//   node scripts/get-load-test-tokens.mjs
//
// Output: scripts/.load-test-tokens.json (gitignored) — one entry per
// account with a ready-to-use `cookieHeader` string. Set it as the `Cookie`
// header on every request in your load-test tool to hit the app as that
// logged-in user, e.g. (k6):
//
//   import { sessions } from ... // load the JSON
//   const s = sessions[__VU % sessions.length];
//   http.get('https://your-test-env/dashboard', { headers: { Cookie: s.cookieHeader } });

import { createServerClient } from "@supabase/ssr";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local.");
  process.exit(1);
}

const credsPath = path.resolve(process.cwd(), "scripts/.load-test-credentials.json");
if (!existsSync(credsPath)) {
  console.error(`${credsPath} not found — run seed-load-test-users.mjs first.`);
  process.exit(1);
}
const creds = JSON.parse(readFileSync(credsPath, "utf8"));

const sessions = [];
for (const { email, password, userId } of creds) {
  const jar = new Map();
  const supabase = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) jar.set(name, value);
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    console.error(`FAILED login for ${email}: ${error?.message ?? "no session returned"}`);
    continue;
  }

  const cookieHeader = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  sessions.push({ email, userId, cookieHeader, accessToken: data.session.access_token, expiresAt: data.session.expires_at });
  console.log(`logged in ${email}`);
}

const outPath = path.resolve(process.cwd(), "scripts/.load-test-tokens.json");
writeFileSync(outPath, JSON.stringify(sessions, null, 2));
console.log(`\nWrote ${sessions.length} session(s) to ${outPath} (gitignored — never commit this file).`);
console.log(`Each entry's "cookieHeader" is ready to set as the Cookie header in your load-test tool.`);
console.log(`Tokens/sessions typically expire in ~1 hour — re-run this script to refresh them if a long run needs it.`);
