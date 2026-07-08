"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in red for destructive actions */
  danger?: boolean;
}

interface FeedbackContextValue {
  /** Show a transient in-app toast (replaces window.alert). */
  toast: (message: string, type?: ToastType) => void;
  /** Show an in-app confirm dialog (replaces window.confirm). Resolves true/false. */
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

const toastStyles: Record<ToastType, { icon: React.ReactNode; ring: string }> = {
  success: { icon: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />, ring: "border-emerald-200" },
  error: { icon: <AlertCircle className="h-4.5 w-4.5 text-red-600" />, ring: "border-red-200" },
  info: { icon: <Info className="h-4.5 w-4.5 text-blue-600" />, ring: "border-blue-200" },
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-4), { id, message, type }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  const confirm = useCallback((opts: ConfirmOptions | string) => {
    const o: ConfirmOptions = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => setConfirmState({ opts: o, resolve }));
  }, []);

  function settle(v: boolean) {
    confirmState?.resolve(v);
    setConfirmState(null);
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast stack */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 z-[100] space-y-2 w-[min(92vw,380px)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{ animation: "lp-toast-in .22s ease-out" }}
            className={`pointer-events-auto flex items-start gap-2.5 bg-white border ${toastStyles[t.type].ring} shadow-lg shadow-slate-900/5 rounded-xl px-3.5 py-3`}
          >
            <span className="mt-0.5 flex-shrink-0">{toastStyles[t.type].icon}</span>
            <p className="flex-1 text-sm text-slate-800 leading-snug">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="p-0.5 rounded text-slate-300 hover:text-slate-500">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => settle(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            style={{ animation: "lp-toast-in .18s ease-out" }}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5"
          >
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${confirmState.opts.danger ? "bg-red-50 dark:bg-red-500/15" : "bg-blue-50 dark:bg-blue-500/15"}`}>
                <AlertTriangle className={`h-5 w-5 ${confirmState.opts.danger ? "text-red-600" : "text-blue-600"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">{confirmState.opts.title || "Are you sure?"}</p>
                <p className="text-sm text-slate-600 mt-1">{confirmState.opts.message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => settle(false)}>
                {confirmState.opts.cancelLabel || "Cancel"}
              </Button>
              <Button variant={confirmState.opts.danger ? "danger" : "primary"} onClick={() => settle(true)}>
                {confirmState.opts.confirmLabel || "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
