import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

// Free email finder — no third-party API, no per-lookup cost. Generates the
// likely address patterns for a name + company domain, then asks the domain's
// own mail server (via a real SMTP handshake, nothing sent) which one it would
// actually accept. This is a best-effort fallback, not a replacement for a real
// verification service — see the accuracy caveats on each function below.

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().toLowerCase().replace(/[^a-z\s'-]/g, "").split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts[parts.length - 1] || "" };
}

function candidatePatterns(fullName: string, domain: string): string[] {
  const { first, last } = splitName(fullName);
  if (!first) return [];
  const f = first[0];
  const patterns = last
    ? [
        `${first}.${last}`, `${first}${last}`, `${f}${last}`, `${f}.${last}`,
        `${last}.${first}`, `${first}_${last}`, first, last,
      ]
    : [first];
  return [...new Set(patterns)].map((p) => `${p}@${domain}`);
}

/** Opens a raw SMTP connection and asks (via RCPT TO) whether `email` would be accepted. Sends nothing. */
function smtpProbe(mxHost: string, email: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    let step = 0;
    let settled = false;
    const socket = net.createConnection({ host: mxHost, port: 25 });

    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(accepted);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.on("error", () => finish(false));
    socket.on("data", (chunk) => {
      const code = parseInt(chunk.toString().slice(0, 3), 10);
      if (step === 0) { socket.write("HELO nxelio.com\r\n"); step = 1; return; }
      if (step === 1) { socket.write("MAIL FROM:<verify@nxelio.com>\r\n"); step = 2; return; }
      if (step === 2) { socket.write(`RCPT TO:<${email}>\r\n`); step = 3; return; }
      socket.write("QUIT\r\n");
      finish(code >= 200 && code < 300);
    });
  });
}

async function resolveMx(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records.length) return null;
    return records.sort((a, b) => a.priority - b.priority)[0].exchange;
  } catch {
    return null;
  }
}

/**
 * Guesses and verifies an email for a person at a company domain, for free.
 *
 * IMPORTANT — deployment caveat: this works by opening a real outbound SMTP
 * connection on port 25. Most serverless platforms (Vercel included — it runs
 * on AWS Lambda) block outbound port 25 by default to prevent spam, with no
 * way to lift the block for Lambda-based functions. In practice this means
 * this function will likely return `{ ok: false }` for every lookup once
 * deployed there, even though it can work in a normal server/VM environment
 * that allows outbound 25. Treat it as a bonus for non-serverless deployments,
 * not something to rely on the way you can rely on AnySite in production.
 */
export interface EmailGuessResult {
  ok: boolean;
  email?: string;
  /** "valid" — this specific address was accepted by the mail server.
   *  "catch_all" — the domain accepts every address, so this is our best
   *  guess but not individually confirmed. Only ever set from a real SMTP
   *  probe, never guessed at. */
  status?: "valid" | "catch_all";
  error?: string;
}

export async function guessAndVerifyEmail(fullName: string, websiteUrl: string): Promise<EmailGuessResult> {
  let domain: string;
  try { domain = new URL(websiteUrl).hostname.replace(/^www\./, ""); } catch { return { ok: false, error: "Invalid website URL" }; }

  const patterns = candidatePatterns(fullName, domain);
  if (!patterns.length) return { ok: false, error: "Couldn't derive a name to guess from" };

  const mxHost = await resolveMx(domain);
  if (!mxHost) return { ok: false, error: "Domain has no mail server (MX record)" };

  // Catch-all check: if the server accepts a deliberately fake address too,
  // it accepts everything, so no individual guess can be confirmed. Real
  // verification tools still surface the best-guessed pattern in this case,
  // labeled "catch_all" rather than hiding it entirely — do the same here.
  const fakeProbe = `nxelio-verify-${Date.now()}@${domain}`;
  const catchAll = await smtpProbe(mxHost, fakeProbe);
  if (catchAll) return { ok: true, email: patterns[0].split("@")[0] + "@" + domain, status: "catch_all" };

  for (const candidate of patterns) {
    if (await smtpProbe(mxHost, candidate)) return { ok: true, email: candidate, status: "valid" };
  }
  return { ok: false, error: "No guessed pattern was accepted" };
}
