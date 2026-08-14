import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getIdleTimeoutMinutes, IDLE_ACTIVITY_COOKIE } from "@/lib/idle-timeout-config";

// NOTE: this app is on a Next.js version where "Middleware" was renamed to
// "Proxy" (file must be named proxy.ts, exported function must be named
// `proxy`, not `middleware`) — see node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/proxy.md. Functionality is the same.

// Paths with no authenticated app session — the idle-timeout check below
// skips these. Separate from (and broader than) the isAppPage allowlist
// further down, which only gates the login/dashboard redirect and predates
// several newer sections (accounts, contacts, opportunities, etc.) — reusing
// its gaps here would leave those pages unprotected by the idle timeout.
const PUBLIC_PATH_PREFIXES = [
  "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/check-email",
  "/auth", "/privacy", "/terms", "/capture", "/book", "/checkout-return",
  "/admin", "/api",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/check-email");
  const isAuthCallback = path.startsWith("/auth/");
  if (isAuthCallback) return response;
  const isAppPage = ["/dashboard","/leads","/segments","/campaigns","/newsletters","/workflows","/inbox","/templates","/analytics","/users","/capture-form","/settings","/billing","/help","/onboarding"].some((p) => path.startsWith(p));

  // Not logged in + trying to access app → redirect to login
  if (!user && isAppPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in + on auth page → redirect to dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // --- Idle session timeout ---
  // Real server-side enforcement, not just a client-side timer: a request
  // arriving after the configured idle window gets its session revoked and
  // is redirected, regardless of whether the underlying Supabase token is
  // technically still valid. Only reads a cookie on the common "still
  // active" path — Next's own Proxy guidance warns against DB/auth-API
  // calls on every request since Proxy runs on every route including
  // prefetches; the signOut() call below only fires once actually expired.
  if (user && !isPublicPath(path)) {
    const now = Date.now();
    const lastActivityRaw = request.cookies.get(IDLE_ACTIVITY_COOKIE)?.value;
    const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : null;
    const idleLimitMs = getIdleTimeoutMinutes() * 60_000;

    if (lastActivity !== null && Number.isFinite(lastActivity) && now - lastActivity > idleLimitMs) {
      try {
        await supabase.auth.signOut(); // reassigns `response` via setAll above, clearing the Supabase session cookies
      } catch {
        // best-effort — the idle cookie is cleared and the redirect happens either way
      }
      const idleResponse = NextResponse.redirect(new URL("/login?reason=idle", request.url));
      response.cookies.getAll().forEach((c) => idleResponse.cookies.set(c));
      idleResponse.cookies.delete(IDLE_ACTIVITY_COOKIE);
      return idleResponse;
    }

    // Still within the window (or first authenticated request of a fresh
    // session) — slide the cookie forward so real activity never expires.
    response.cookies.set(IDLE_ACTIVITY_COOKIE, String(now), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: idleLimitMs / 1000,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
