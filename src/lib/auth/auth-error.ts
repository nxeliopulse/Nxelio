export function friendlyAuthError(err: { code?: string; message?: string }): string {
  const code = err.code ?? "";
  const msg  = (err.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("api error")) {
    return "Incorrect email or password. Please try again.";
  }
  if (code === "user_not_found" || msg.includes("user not found")) {
    return "No account found with that email address.";
  }
  if (code === "over_request_rate_limit" || msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Please check your connection and try again.";
  }
  return "Sign in failed. Please check your details and try again.";
}
