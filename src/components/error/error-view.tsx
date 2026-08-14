"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowLeft, Home, Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  UnauthorizedIllustration,
  NotFoundIllustration,
  ServerErrorIllustration,
  NetworkErrorIllustration,
  TimeoutIllustration,
  UnknownErrorIllustration,
} from "./error-illustrations";

export interface ErrorViewProps {
  errorCode: string;
  errorTitle: string;
  errorMessage: string;
  technicalDetails?: string;
  retryFunction?: () => void;
}

export function ErrorView({
  errorCode,
  errorTitle,
  errorMessage,
  technicalDetails,
  retryFunction,
}: ErrorViewProps) {
  const router = useRouter();
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Map error code to illustration
  const renderIllustration = () => {
    const code = errorCode.toUpperCase();
    if (code === "401" || code === "403" || code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      return <UnauthorizedIllustration className="w-40 h-40 sm:w-48 sm:h-48 text-teal-600 dark:text-teal-400" />;
    }
    if (code === "404" || code === "NOT_FOUND") {
      return <NotFoundIllustration className="w-40 h-40 sm:w-48 sm:h-48 text-teal-600 dark:text-teal-400" />;
    }
    if (code === "500" || code === "INTERNAL_SERVER_ERROR") {
      return <ServerErrorIllustration className="w-40 h-40 sm:w-48 sm:h-48 text-red-500" />;
    }
    if (code === "NETWORK" || code === "NETWORK_ERROR") {
      return <NetworkErrorIllustration className="w-40 h-40 sm:w-48 sm:h-48 text-sky-500" />;
    }
    if (code === "TIMEOUT" || code === "TIMEOUT_ERROR") {
      return <TimeoutIllustration className="w-40 h-40 sm:w-48 sm:h-48 text-amber-500" />;
    }
    return <UnknownErrorIllustration className="w-40 h-40 sm:w-48 sm:h-48 text-slate-500 dark:text-slate-400" />;
  };

  const handleRetry = async () => {
    if (!retryFunction) return;
    setIsRetrying(true);
    try {
      await retryFunction();
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 md:p-6 overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans transition-colors duration-300">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-[450px] sm:h-[450px] rounded-full bg-teal-500/10 dark:bg-teal-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-72 h-72 sm:w-[450px] sm:h-[450px] rounded-full bg-indigo-500/10 dark:bg-indigo-500/5 blur-3xl pointer-events-none" />

      {/* Large Error Code Background Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <h1 className="text-[22vw] font-black tracking-tight text-slate-200/40 dark:text-slate-900/15 leading-none transition-colors duration-300">
          {errorCode}
        </h1>
      </div>

      {/* Glassmorphic Card Container */}
      <div 
        style={{ animation: "lp-error-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
        className="relative z-10 w-full max-w-xl rounded-2xl border border-white/30 dark:border-slate-800/40 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center transition-all duration-300"
      >
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes lp-error-in {
            from { opacity: 0; transform: scale(0.96) translateY(12px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}} />

        {/* Dynamic Illustration */}
        <div className="mb-4 transform hover:scale-105 transition-transform duration-300">
          {renderIllustration()}
        </div>

        {/* Error Info */}
        <div className="space-y-2.5 max-w-md">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200/30 dark:border-red-900/30 select-none">
            Error {errorCode}
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
            {errorTitle}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed font-normal">
            {errorMessage}
          </p>
        </div>

        {/* Technical Details Accordion */}
        {technicalDetails && (
          <div className="w-full mt-6 text-left border-t border-slate-200/50 dark:border-slate-800/50 pt-4">
            <button
              onClick={() => setShowTechDetails(!showTechDetails)}
              className="flex items-center justify-between w-full text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5" />
                Technical Details
              </span>
              {showTechDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showTechDetails && (
              <pre className="mt-2.5 p-3 rounded-lg bg-slate-950/90 text-slate-300 border border-slate-800 font-mono text-[11px] leading-normal overflow-auto max-h-40 select-text scrollbar-thin">
                {technicalDetails}
              </pre>
            )}
          </div>
        )}

        {/* Actions Button Row */}
        <div className="mt-8 w-full flex flex-col sm:flex-row gap-3 items-stretch sm:justify-center">
          {retryFunction && (
            <Button
              variant="primary"
              disabled={isRetrying}
              onClick={handleRetry}
              className="flex-1 sm:flex-none justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
              {isRetrying ? "Retrying..." : "Try Again"}
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={handleRefresh}
            className="flex-1 sm:flex-none justify-center gap-2 border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>

          <Button
            variant="outline"
            onClick={handleGoBack}
            className="flex-1 sm:flex-none justify-center gap-2 border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>

          <Link href="/dashboard" passHref className="flex-1 sm:flex-none">
            <Button
              variant="outline"
              className="w-full justify-center gap-2 border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
