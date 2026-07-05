"use client";

/**
 * Cross-component signal fired right after an AI feature successfully deducts a
 * credit, so anything displaying the balance (sidebar widgets, the billing page)
 * can refetch immediately instead of waiting for the next route change.
 */
const AI_CREDITS_CHANGED_EVENT = "ai-credits-changed";

export function notifyCreditsChanged() {
  window.dispatchEvent(new Event(AI_CREDITS_CHANGED_EVENT));
}

export function onCreditsChanged(handler: () => void): () => void {
  window.addEventListener(AI_CREDITS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(AI_CREDITS_CHANGED_EVENT, handler);
}
