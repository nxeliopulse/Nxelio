// Deletes every account created by seed-load-test-users.mjs (and its
// auto-created workspace, subscription, etc. via ON DELETE CASCADE) once a
// load-testing run is done, so test accounts don't linger in the project.
//
// Usage:
//   node scripts/cleanup-load-test-users.mjs             (dry run — lists what would be deleted)
//   node scripts/cleanup-load-test-users.mjs --confirm

import { readFileSync, existsSync, unlinkSync } from "node:fs";
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
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local.");
  process.exit(1);
}

const credsPath = path.resolve(process.cwd(), "scripts/.load-test-credentials.json");
if (!existsSync(credsPath)) {
  console.log("No scripts/.load-test-credentials.json found — nothing to clean up.");
  process.exit(0);
}
const creds = JSON.parse(readFileSync(credsPath, "utf8"));
const confirmed = process.argv.includes("--confirm");

console.log(`Target Supabase project: ${SUPABASE_URL}`);
console.log(`${confirmed ? "Deleting" : "Would delete"} ${creds.length} load-test account(s).`);

if (!confirmed) {
  for (const c of creds) console.log(`  - ${c.email}`);
  console.log(`\nRe-run with --confirm to actually delete them.`);
  process.exit(0);
}

let deleted = 0;
for (const { email, userId } of creds) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (res.ok || res.status === 404) {
    deleted++;
    console.log(`  deleted ${email}`);
  } else {
    console.error(`  FAILED to delete ${email}: ${res.status}`);
  }
}

unlinkSync(credsPath);
const tokensPath = path.resolve(process.cwd(), "scripts/.load-test-tokens.json");
if (existsSync(tokensPath)) unlinkSync(tokensPath);

console.log(`\nDone — ${deleted}/${creds.length} accounts deleted. Local credential/token files removed.`);
