"use server";

/**
 * Deliberately does nothing — its only purpose is to be a same-origin
 * request that passes through src/proxy.ts. Raw DOM activity (mousemove,
 * scroll, etc.) never reaches the server on its own, so
 * IdleTimeoutProvider calls this periodically while the user is active,
 * which is what actually slides the server-side idle cookie forward.
 */
export async function pingActivity(): Promise<{ ok: true }> {
  return { ok: true };
}
