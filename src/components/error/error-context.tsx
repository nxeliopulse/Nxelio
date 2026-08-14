"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
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

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [activeError, setActiveError] = useState<AppError | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
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
          const errorDetails = mapErrorDetails(response.status, response.statusText, url);
          const appError = new AppError(errorDetails);
          
          // Determine if we should show the full screen error
          // 401 and 403 are critical; 500 is critical.
          // 404 is ignored for suggestion/autocomplete APIs to prevent locking user interface
          const isSilent = url.includes("/suggest") || url.includes("/search") || url.includes("/autocomplete");
          
          if (
            response.status === 401 ||
            response.status === 403 ||
            response.status === 500 ||
            (!isSilent && response.status === 404)
          ) {
            setActiveError(appError);
          }
          
          throw appError;
        }
        
        return response;
      } catch (err: any) {
        if (err instanceof AppError) {
          throw err;
        }

        // Map network connection errors
        const isTimeout = err.name === "AbortError" || err.message?.toLowerCase().includes("timeout");
        const details = `URL: ${url}\nError: ${err.message || err}\nTimestamp: ${new Date().toISOString()}`;
        
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

        // Network connection issues are critical, show global error
        const isSilent = url.includes("/suggest") || url.includes("/search") || url.includes("/autocomplete");
        if (!isSilent) {
          setActiveError(appError);
        }

        throw appError;
      }
    };

    // 2. Catch all global uncaught errors and rejections
    const handleGlobalError = (event: ErrorEvent) => {
      // Don't show full page error for simple styling or third-party extension issues
      if (
        event.message?.includes("ResizeObserver") ||
        event.filename?.includes("chrome-extension")
      ) {
        return;
      }

      const details = `File: ${event.filename || "Unknown"}\nLine: ${event.lineno || 0}:${event.colno || 0}\nMessage: ${event.message || "Unknown error"}`;
      const appError = new AppError({
        code: "UNKNOWN",
        title: "Application Exception",
        message: "A runtime error occurred in the application. We are looking into it.",
        technicalDetails: details + (event.error?.stack ? `\nStack:\n${event.error.stack}` : ""),
      });
      
      setActiveError(appError);
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

      setActiveError(appError);
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handlePromiseRejection);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("error", handleGlobalError);
      window.removeEventListener("unhandledrejection", handlePromiseRejection);
    };
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

  // Render original tree or Error page
  if (isMounted && activeError) {
    return (
      <ErrorContext.Provider value={value}>
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
      </ErrorContext.Provider>
    );
  }

  return <ErrorContext.Provider value={value}>{children}</ErrorContext.Provider>;
}
