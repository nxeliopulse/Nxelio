import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["10.154.249.207"],
  // A stray package-lock.json in the parent directory (/Users/apple) otherwise
  // makes Turbopack misdetect the workspace root and 404 every route.
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
