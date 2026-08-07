"use client";
/**
 * ============================================================================
 * Phase 2 — UI Action Provider
 * ============================================================================
 * Client-side executor for assistant-emitted UI actions:
 * - kind "navigate" → router.push to the registry's whitelisted target
 * - kind "modal"   → sets pendingModal; the page component that owns that
 *                    modal (e.g. the leads table) consumes it and opens the
 *                    real form, pre-filled where possible. Nothing mutates
 *                    until the user saves in the real UI.
 * ============================================================================
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getUiActionDef, type UiActionCall } from "@/lib/ui-actions/registry";

export interface PendingModal {
  id: string;
  params: Record<string, unknown>;
}

export interface PendingFilters {
  id: string;
  params: Record<string, unknown>;
}

interface UiActionsCtx {
  /** Modal the assistant asked to open (consumed by the owning page, then cleared). */
  pendingModal: PendingModal | null;
  /** Filters the assistant asked to apply (consumed by the owning page, then cleared). */
  pendingFilters: PendingFilters | null;
  /** Executes a UI action card click. Returns false if the action is unknown. */
  executeUiAction: (action: UiActionCall) => Promise<boolean>;
  /** Clears the pending modal after the page has opened it. */
  clearPendingModal: () => void;
  /** Clears the pending filters after the page has applied them. */
  clearPendingFilters: () => void;
}

const UiActionsContext = createContext<UiActionsCtx>({
  pendingModal: null,
  pendingFilters: null,
  executeUiAction: async () => false,
  clearPendingModal: () => {},
  clearPendingFilters: () => {},
});

export function UiActionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pendingModal, setPendingModal] = useState<PendingModal | null>(null);
  const [pendingFilters, setPendingFilters] = useState<PendingFilters | null>(null);

  const executeUiAction = useCallback(
    async (action: UiActionCall): Promise<boolean> => {
      const def = getUiActionDef(action.id);
      if (!def) return false;
      if (def.kind === "navigate" && def.target) {
        // Client-side navigation — same UX as clicking the sidebar link.
        router.push(def.target);
        return true;
      }
      if (def.kind === "modal" && def.modal) {
        // Navigate to the page that owns this modal (no-op if already there),
        // then queue the modal — the page consumes pendingModal when mounted.
        if (def.page) router.push(def.page);
        setPendingModal({ id: def.modal, params: action.params ?? {} });
        return true;
      }
      if (def.kind === "filter" && def.target) {
        // Same contract as modals: navigate to the owning page, then queue
        // the filters — the page applies and clears them.
        router.push(def.target);
        setPendingFilters({ id: def.id, params: action.params ?? {} });
        return true;
      }
      return false;
    },
    [router]
  );

  const clearPendingModal = useCallback(() => setPendingModal(null), []);
  const clearPendingFilters = useCallback(() => setPendingFilters(null), []);

  return (
    <UiActionsContext.Provider value={{ pendingModal, pendingFilters, executeUiAction, clearPendingModal, clearPendingFilters }}>
      {children}
    </UiActionsContext.Provider>
  );
}

export const useUiActions = () => useContext(UiActionsContext);
