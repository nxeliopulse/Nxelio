/**
 * Full-page loading indicator shown by each route's loading.tsx while the
 * server renders. Same animation everywhere so screen-to-screen navigation
 * feels consistent.
 */
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)] w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- self-animating SVG; Next/Image's optimizations don't apply to it */}
      <img src="/loading.svg" alt="Loading" className="w-44 h-auto" />
    </div>
  );
}
