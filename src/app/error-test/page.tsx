"use client";

import { useErrorHandler, AppError } from "@/components/error/error-context";
import { Button } from "@/components/ui/button";

export default function ErrorTestPage() {
  const { showError } = useErrorHandler();

  const simulateError = (code: string) => {
    let err: AppError;
    
    switch (code) {
      case "401":
        err = new AppError({
          code: "401",
          title: "Session Expired",
          message: "Please sign in again to access this workspace.",
          technicalDetails: "Status: 401 Unauthorized\nReason: JWT signature expired",
        });
        break;
      case "403":
        err = new AppError({
          code: "403",
          title: "Access Denied",
          message: "You don't have permission to modify settings on this tenant.",
          technicalDetails: "Status: 403 Forbidden\nUser role: read-only",
        });
        break;
      case "404":
        err = new AppError({
          code: "404",
          title: "Resource Not Found",
          message: "The lead records you requested could not be retrieved.",
          technicalDetails: "Status: 404 Not Found\nID: lead_01J5K893",
        });
        break;
      case "500":
        err = new AppError({
          code: "500",
          title: "Internal Server Error",
          message: "The database failed to respond to the query.",
          technicalDetails: "Status: 500 Internal Server Error\nDatabase connection timeout",
        });
        break;
      case "NETWORK":
        err = new AppError({
          code: "NETWORK",
          title: "Network Connection Lost",
          message: "Your device lost connection to the Internet. Please check your router.",
          technicalDetails: "Fetch failed: DNS name resolution failed",
        });
        break;
      case "TIMEOUT":
        err = new AppError({
          code: "TIMEOUT",
          title: "Request Timeout",
          message: "The campaign analytics request took longer than 15,000ms.",
          technicalDetails: "Fetch aborted: timeout",
        });
        break;
      default:
        err = new AppError({
          code: "UNKNOWN",
          title: "Unexpected Error",
          message: "An unknown system exception has occurred.",
          technicalDetails: "Stack Trace:\nTypeError: Cannot read properties of undefined (reading 'map')",
        });
    }
    
    showError(err);
  };

  const triggerReactCrash = () => {
    // This will force a standard React render-time exception
    // It will bubble up directly to the root Next.js error.tsx boundary
    throw new Error("This is a simulated React rendering crash!");
  };

  const triggerFetchFailure = async () => {
    // Fetches a non-existent URL which will cause a 404, caught by interceptor
    await fetch("/api/non-existent-leadpro-route");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-8 flex flex-col items-center justify-center font-sans">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-200 dark:border-slate-700">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 text-center mb-1">
          Error Handling Test Panel
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
          Click any button to trigger and test the centralized error screens.
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-2 tracking-wider uppercase">
              1. Simulated Errors (via showError Context)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => simulateError("401")} variant="outline" className="text-xs">
                Trigger 401
              </Button>
              <Button onClick={() => simulateError("403")} variant="outline" className="text-xs">
                Trigger 403
              </Button>
              <Button onClick={() => simulateError("404")} variant="outline" className="text-xs">
                Trigger 404
              </Button>
              <Button onClick={() => simulateError("500")} variant="outline" className="text-xs">
                Trigger 500
              </Button>
              <Button onClick={() => simulateError("NETWORK")} variant="outline" className="text-xs col-span-2">
                Trigger Network Error
              </Button>
              <Button onClick={() => simulateError("TIMEOUT")} variant="outline" className="text-xs col-span-2">
                Trigger Timeout Error
              </Button>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
            <p className="text-xs font-semibold text-slate-400 mb-2 tracking-wider uppercase">
              2. Real Application Triggers
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={triggerFetchFailure} variant="secondary" className="text-xs">
                Simulate 404 Fetch Call (Interceptors)
              </Button>
              <Button onClick={triggerReactCrash} variant="danger" className="text-xs">
                Crash Client Render (Error Boundary)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
