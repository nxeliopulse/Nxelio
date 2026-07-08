import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Magic link / email confirmation callback.
 * Supabase redirects users here after they click the link in their email.
 * We exchange the code for a session, then send them to /dashboard.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";

  if (!code) {
    // No code = invalid/expired link — bounce to login with a hint
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.search = "?error=invalid_link";
    return NextResponse.redirect(redirect);
  }

  const response = NextResponse.redirect(new URL(next, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const redirect = url.clone();
    redirect.pathname = "/login";
    redirect.search = `?error=${encodeURIComponent(error.message)}`;
    return NextResponse.redirect(redirect);
  }

  return response;
}
