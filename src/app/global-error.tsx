"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/error/error-view";
import "./globals.css";

interface GlobalErrorProps {
  error: Error & {
    digest?: string;
    code?: string;
    title?: string;
    technicalDetails?: string;
  };
  unstable_retry: () => void;
}

export default function GlobalError({
  error,
  unstable_retry,
}: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global Layout critical exception:", error);
  }, [error]);

  const errorCode = error.code || "500";
  const errorTitle = error.title || "Fatal System Exception";
  const errorMessage = error.message || "A fatal system crash occurred that blocked the initial page layout load.";
  const technicalDetails = 
    error.technicalDetails || 
    error.stack || 
    (error.digest ? `Digest ID: ${error.digest}` : undefined);

  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-100 dark:bg-slate-950">
        <ErrorView
          errorCode={errorCode}
          errorTitle={errorTitle}
          errorMessage={errorMessage}
          technicalDetails={technicalDetails}
          retryFunction={unstable_retry}
        />
      </body>
    </html>
  );
}
