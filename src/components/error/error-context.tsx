"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, X } from "lucide-react";
import { ErrorView } from "./error-view";

export interface AppErrorOptions {
  code: string;
  title: string;
  message: string;
  technicalDetails?: string;
  retryFunction?: () => void;
}

export class AppError extends Error {
  code: string;
  title: string;
  technicalDetails?: string;
  retryFunction?: () => void;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.title = options.title;
    this.technicalDetails = options.technicalDetails;
    this.retryFunction = options.retryFunction;
  }
}

interface ErrorContextValue {
  activeError: AppError | null;
  showError: (error: AppError | Error | string) => void;
  clearError: () => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function useErrorHandler(): ErrorContextValue {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error("useErrorHandler must be used within an ErrorProvider");
  }
  return context;
}

interface ErrorToastItem {
  id: number;
  title: string;
  message: string;
}

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [activeError, setActiveError] = useState<AppError | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Background/network errors surface as a small dismissible toast instead
  // of replacing the whole app — a single failed fetch anywhere (even on an
  // unrelated widget) used to tear down the entire page with a full-screen
  // "Application Exception" screen, which is far more disruptive than the
  // error usually warrants. `activeError`/`ErrorView` above stays available
  // for deliberate, explicit use via `showError()` (see /error-test).
  const [toasts, setToasts] = useState<ErrorToastItem[]>([]);
  const toastIdRef = useRef(0);
  // Tracks the last time each distinct error (by title+message) was shown, so
  // the same underlying error firing several times in a row (e.g. React
  // retrying a failed hydration, or a request being retried) shows ONE toast
  // instead of stacking duplicates on top of each other.
  const recentErrorsRef = useRef<Map<string, number>>(new Map());
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);
  const pushToast = useCallback((error: AppError) => {
    const key = `${error.title}::${error.message}`;
    const now = Date.now();
    const lastShown = recentErrorsRef.current.get(key);
    if (lastShown && now - lastShown < 6000) return;
    recentErrorsRef.current.set(key, now);

    const id = ++toastIdRef.current;
    setToasts((t) => [...t.slice(-3), { id, title: error.title, message: error.message }]);
    setTimeout(() => dismissToast(id), 6000);
  }, [dismissToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-mounted flag, needed to avoid SSR/client render mismatches; there's no pure way to know "are we mounted" during render
    setIsMounted(true);
  }, []);

  // Set up interceptors only on client side
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Helper to map status codes to AppError
    const mapErrorDetails = (status: number, statusText: string, url: string): AppErrorOptions => {
      const details = `URL: ${url}\nStatus: ${status} (${statusText || "Unknown"})\nTimestamp: ${new Date().toISOString()}`;
      
      switch (status) {
        case 401:
          return {
            code: "401",
            title: "Session Expired",
            message: "Your session has expired or you are unauthorized. Please log in again to continue.",
            technicalDetails: details,
          };
        case 403:
          return {
            code: "403",
            title: "Access Denied",
            message: "You do not have the required permissions to access this page or resource.",
            technicalDetails: details,
          };
        case 404:
          return {
            code: "404",
            title: "Resource Not Found",
            message: "The page or API endpoint you are trying to reach could not be found.",
            technicalDetails: details,
          };
        case 408:
        case 504:
          return {
            code: "TIMEOUT",
            title: "Connection Timeout",
            message: "The server took too long to respond. Please check your internet connection.",
            technicalDetails: details,
          };
        case 500:
        case 502:
        case 503:
          return {
            code: "500",
            title: "Internal Server Error",
            message: "Something went wrong on our servers. Our technical team has been notified.",
            technicalDetails: details,
          };
        default:
          return {
            code: status.toString(),
            title: `HTTP Error ${status}`,
            message: "An API error occurred while processing your request. Please try again.",
            technicalDetails: details,
          };
      }
    };

    // 1. Intercept window.fetch
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      try {
        const response = await originalFetch(input, init);
        
        if (!response.ok) {
          // Read the server's own JSON error first. Routes return actionable
          // messages ("a cancellation request is already open for your
          // account"), and this interceptor used to discard them and throw a
          // generic status-code message instead — so a normal business rule
          // reached the user as "something went wrong on our servers".
          // Clone, because the caller still needs to read the body itself.
          let serverMessage: string | undefined;
          try {
            const data = await response.clone().json();
            const m = (data as Record<string, unknown> | null)?.error ?? (data as Record<string, unknown> | null)?.message;
            if (typeof m === "string" && m.trim()) serverMessage = m.trim();
          } catch { /* non-JSON body — fall back to the status-code message */ }

          const errorDetails = mapErrorDetails(response.status, response.statusText, url);
          // Only trust the server's wording for 4xx. A 5xx message is usually a
          // raw internal error (a Postgres message, a stack detail) that should
          // not be shown to a customer, so those keep the generic text.
          if (serverMessage && response.status >= 400 && response.status < 500) {
            errorDetails.message = serverMessage;
          }
          const appError = new AppError(errorDetails);

          // 404 is ignored for suggestion/autocomplete APIs to prevent toast spam.
          const isSilent = url.includes("/suggest") || url.includes("/search") || url.includes("/autocomplete");

          if (
            response.status === 401 ||
            response.status === 403 ||
            response.status === 500 ||
            (!isSilent && response.status === 404)
          ) {
            pushToast(appError);
          }

          throw appError;
        }
        
        return response;
      } catch (err: unknown) {
        if (err instanceof AppError) {
          throw err;
        }

        // Map network connection errors
        const error = err instanceof Error ? err : new Error(String(err));
        const isTimeout = error.name === "AbortError" || error.message?.toLowerCase().includes("timeout");
        const details = `URL: ${url}\nError: ${error.message || error}\nTimestamp: ${new Date().toISOString()}`;
        
        const appError = new AppError(
          isTimeout
            ? {
                code: "TIMEOUT",
                title: "Request Timeout",
                message: "The request timed out. Please check your network and try again.",
                technicalDetails: details,
              }
            : {
                code: "NETWORK",
                title: "Network Connection Error",
                message: "Unable to connect to the server. Please check your internet connection.",
                technicalDetails: details,
              }
        );

        const isSilent = url.includes("/suggest") || url.includes("/search") || url.includes("/autocomplete");
        if (!isSilent) {
          pushToast(appError);
        }

        throw appError;
      }
    };

    // 2. Catch all global uncaught errors and rejections
    const handleGlobalError = (event: ErrorEvent) => {
      // Don't toast for simple styling or third-party extension issues
      if (
        event.message?.includes("ResizeObserver") ||
        event.filename?.includes("chrome-extension")
      ) {
        return;
      }

      const details = `File: ${event.filename || "Unknown"}\nLine: ${event.lineno || 0}:${event.colno || 0}\nMessage: ${event.message || "Unknown error"}`;
      // Logged, not shown to the user: this bucket catches ANY uncaught
      // window-level error, most of which are one-off, non-blocking hiccups
      // (a third-party script, a stray timing issue) that don't stop the app
      // from working — the rest of the page keeps rendering fine underneath
      // it. A canned "Application Exception" toast with no actionable info
      // was scarier than useful. Still logged here so it's visible in the
      // browser console (and easy to wire to a real error tracker later).
      console.error(
        "[global-error]",
        details + (event.error?.stack ? `\nStack:\n${event.error.stack}` : "")
      );
    };

    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      
      // If it's already an AppError handled by fetch, we don't need to show a duplicate
      if (reason instanceof AppError) return;

      const details = `Promise rejected: ${reason?.message || reason || "Unknown reason"}`;
      const appError = new AppError({
        code: "UNKNOWN",
        title: "Unhandled Promise Rejection",
        message: "An unexpected background task failed. Please try again.",
        technicalDetails: details + (reason?.stack ? `\nStack:\n${reason.stack}` : ""),
      });

      pushToast(appError);
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handlePromiseRejection);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handlePromiseRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pushToast's identity is stable (useCallback with a stable dep), and this effect must only attach the window listeners/fetch patch once
  }, []);

  const showError = (error: AppError | Error | string) => {
    if (error instanceof AppError) {
      setActiveError(error);
    } else if (error instanceof Error) {
      setActiveError(
        new AppError({
          code: "UNKNOWN",
          title: "Unexpected Error",
          message: error.message || "An unexpected error occurred.",
          technicalDetails: error.stack,
        })
      );
    } else {
      setActiveError(
        new AppError({
          code: "UNKNOWN",
          title: "Unexpected Error",
          message: String(error),
        })
      );
    }
  };

  const clearError = () => {
    setActiveError(null);
  };

  const value = {
    activeError,
    showError,
    clearError,
  };

  // The full-page ErrorView is now only for deliberate showError() calls
  // (see /error-test) — background/network errors above use the toast stack
  // instead, rendered alongside the app rather than replacing it.
  return (
    <ErrorContext.Provider value={value}>
      {isMounted && activeError ? (
        <ErrorView
          errorCode={activeError.code}
          errorTitle={activeError.title}
          errorMessage={activeError.message}
          technicalDetails={activeError.technicalDetails}
          retryFunction={() => {
            if (activeError.retryFunction) {
              activeError.retryFunction();
            }
            clearError();
          }}
        />
      ) : (
        children
      )}

      {/* Background-error toast stack — matches the app's normal toast style. */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 z-[100] space-y-2 w-[min(92vw,380px)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{ animation: "lp-toast-in .22s ease-out" }}
            className="pointer-events-auto flex items-start gap-2.5 bg-white border border-red-200 shadow-lg shadow-slate-900/5 rounded-xl px-3.5 py-3"
          >
            <AlertCircle className="h-4.5 w-4.5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-snug">{t.title}</p>
              <p className="text-xs text-slate-500 leading-snug mt-0.5">{t.message}</p>
            </div>
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="p-0.5 rounded text-slate-300 hover:text-slate-500 flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ErrorContext.Provider>
  );
}
