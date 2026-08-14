"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/error/error-view";

interface BoundaryErrorProps {
  error: Error & { 
    digest?: string; 
    code?: string; 
    title?: string; 
    technicalDetails?: string;
  };
  unstable_retry: () => void;
}

export default function RootError({
  error,
  unstable_retry,
}: BoundaryErrorProps) {
  useEffect(() => {
    console.error("Boundary caught rendering exception:", error);
  }, [error]);

  const errorCode = error.code || "500";
  const errorTitle = error.title || "Something went wrong";
  
  // Clean up standard error messages in production if needed, but display detailed message in dev
  const errorMessage = error.message || "A rendering or runtime exception occurred inside this page segment.";
  const technicalDetails = 
    error.technicalDetails || 
    error.stack || 
    (error.digest ? `Digest ID: ${error.digest}` : undefined);

  return (
    <ErrorView
      errorCode={errorCode}
      errorTitle={errorTitle}
      errorMessage={errorMessage}
      technicalDetails={technicalDetails}
      retryFunction={unstable_retry}
    />
  );
}
