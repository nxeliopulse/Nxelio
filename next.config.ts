import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Produces .next/standalone — a self-contained server bundle plus a pruned
  // node_modules. The Dockerfile's runner stage copies exactly that path, so
  // without this the image build fails at the COPY step.
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["10.154.249.207"],
  // A stray package-lock.json in the parent directory (/Users/apple) otherwise
  // makes Turbopack misdetect the workspace root and 404 every route.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
