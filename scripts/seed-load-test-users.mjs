// Creates a pool of dedicated load-test accounts, each a normal, fully real
// signup (own workspace, own trial subscription — created by the same DB
// trigger a real signup goes through) with a real password. NOT an auth
// bypass: every one of these accounts still logs in through the real
// username/password flow — load-test-tokens.mjs (run next) does exactly
// that to obtain real session cookies for whatever load-test tool you use.
//
// SAFETY: this only ever talks to the Supabase project named in .env.local
// in the CURRENT working directory. It prints that project URL and refuses
// to create anything until you pass --confirm — read the printed URL first
// and make sure it's your TEST/staging project, never production.
//
// Usage:
//   node scripts/seed-load-test-users.mjs                    (dry run — prints target, creates nothing)
//   node scripts/seed-load-test-users.mjs --count=50 --confirm
//
// Output: scripts/.load-test-credentials.json (gitignored — real passwords, never commit)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local.");
  process.exit(1);
}

const args = process.argv.slice(2);
const countArg = args.find((a) => a.startsWith("--count="));
const count = countArg ? parseInt(countArg.split("=")[1], 10) : 50;
const domainArg = args.find((a) => a.startsWith("--domain="));
const domain = domainArg ? domainArg.split("=")[1] : "nxelio-loadtest.invalid";
const confirmed = args.includes("--confirm");

console.log(`Target Supabase project: ${SUPABASE_URL}`);
console.log(`This will create ${count} real accounts (loadtest1@${domain} .. loadtest${count}@${domain}),`);
console.log(`each with its own real workspace and trial subscription, in the project above.`);
console.log(`Only proceed if that URL is your TEST/staging project — never production.\n`);

if (!confirmed) {
  console.log(`Nothing created (dry run). Re-run with --confirm once you've verified the URL above:`);
  console.log(`  node scripts/seed-load-test-users.mjs --count=${count} --confirm`);
  process.exit(0);
}

function generatePassword() {
  return `Lt-${crypto.randomBytes(9).toString("base64url")}!A1`;
}

const results = [];
for (let i = 1; i <= count; i++) {
  const email = `loadtest${i}@${domain}`;
  const password = generatePassword();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: `Load Test ${i}` } }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`  [${i}/${count}] FAILED ${email}: ${body.msg || body.error_description || res.status}`);
    continue;
  }
  results.push({ email, password, userId: body.id });
  console.log(`  [${i}/${count}] created ${email}`);
}

const outPath = path.resolve(process.cwd(), "scripts/.load-test-credentials.json");
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nDone — ${results.length}/${count} accounts created.`);
console.log(`Credentials saved to ${outPath} (gitignored — never commit this file).`);
console.log(`Next: node scripts/get-load-test-tokens.mjs`);
console.log(`When you're done load testing: node scripts/cleanup-load-test-users.mjs --confirm`);
