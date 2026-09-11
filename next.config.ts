import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // This repo deploys to TWO targets and they want different build output:
  //
  //   Docker/GKE — needs `standalone`: a self-contained server bundle plus a
  //     pruned node_modules at .next/standalone, which the Dockerfile's runner
  //     stage copies. Without it the image build fails at that COPY step.
  //   Vercel — builds its own serverless output and does not use standalone.
  //     Forcing it there changed what the build emitted and broke the deploy.
  //
  // Vercel sets VERCEL=1 during its build, so this picks the right mode per
  // target instead of making one of them wrong.
  output: process.env.VERCEL ? undefined : "standalone",
  devIndicators: false,
  allowedDevOrigins: ["10.154.249.207"],
  // A stray package-lock.json in the parent directory (/Users/apple) otherwise
  // makes Turbopack misdetect the workspace root and 404 every route.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
