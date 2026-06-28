import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the tracing root to this app folder; other lockfiles exist higher up
  // on the machine which would otherwise be inferred as the workspace root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
