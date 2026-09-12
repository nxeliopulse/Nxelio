"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTour } from "./tour-context";
import { getTourState } from "@/lib/queries/tour";
import type { TourStep } from "./tour-types";

/**
 * Auto-starts a page's guided tour the first time a user visits it (per
 * `tour_state.seenTours[pageKey]`), or force-starts it when the page was
 * reached via a `?tour=<pageKey>` link (e.g. from the Getting Started
 * checklist) — same "read a URL param once, then strip it" pattern already
 * used by the Dashboard's WelcomeBanner for `?welcome=1`.
 */
export function usePageTour(pageKey: string, steps: TourStep[], version = "1") {
  const { start, active } = useTour();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Read the value, not the params object, so it can be an effect dependency.
  const tourParam = params.get("tour");

  useEffect(() => {
    let cancelled = false;
    const forced = tourParam === pageKey;

    (async () => {
      if (forced) {
        if (!cancelled) start(pageKey, steps);
        router.replace(pathname, { scroll: false });
        return;
      }
      const state = await getTourState();
      if (!cancelled && !active && state.seenTours[pageKey] !== version) {
        start(pageKey, steps);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `active`/`start` are deliberately excluded: re-running on their identity changes would fight the tour's own state transitions. `tourParam` must be included, though — "Replay product tour" pushes ?tour=<key> while the user is usually ALREADY on that page, which is a same-route navigation that remounts nothing. Keyed on pageKey alone the effect never re-ran, `forced` was never recomputed, and the button silently did nothing.
  }, [pageKey, tourParam]);
}
