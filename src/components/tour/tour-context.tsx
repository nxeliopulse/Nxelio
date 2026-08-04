"use client";
import { createContext, useContext, useState, useCallback } from "react";
import type { TourStep } from "./tour-types";
import { TourOverlay } from "./tour-overlay";

interface ActiveTour {
  pageKey: string;
  steps: TourStep[];
  index: number;
}

interface TourController {
  active: ActiveTour | null;
  start: (pageKey: string, steps: TourStep[]) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
}

const noop = () => {};
const TourContext = createContext<TourController>({ active: null, start: noop, next: noop, back: noop, skip: noop });

export function TourProvider({
  children,
  onTourEnd,
}: {
  children: React.ReactNode;
  /** Called once a tour ends (finished OR skipped) — both count as "seen". */
  onTourEnd: (pageKey: string) => void;
}) {
  const [active, setActive] = useState<ActiveTour | null>(null);

  const start = useCallback((pageKey: string, steps: TourStep[]) => {
    if (steps.length === 0) return;
    setActive({ pageKey, steps, index: 0 });
  }, []);

  const end = useCallback((pageKey: string) => {
    setActive(null);
    onTourEnd(pageKey);
  }, [onTourEnd]);

  const next = useCallback(() => {
    if (!active) return;
    if (active.index >= active.steps.length - 1) {
      end(active.pageKey);
    } else {
      setActive({ ...active, index: active.index + 1 });
    }
  }, [active, end]);

  const back = useCallback(() => {
    if (active && active.index > 0) setActive({ ...active, index: active.index - 1 });
  }, [active]);

  const skip = useCallback(() => {
    if (active) end(active.pageKey);
  }, [active, end]);

  return (
    <TourContext.Provider value={{ active, start, next, back, skip }}>
      {children}
      <TourOverlay active={active} onNext={next} onBack={back} onSkip={skip} />
    </TourContext.Provider>
  );
}

export function useTour(): TourController {
  return useContext(TourContext);
}
