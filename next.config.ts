import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Treat server-only packages as external to avoid Turbopack bundle errors */
  serverExternalPackages: ["bull"],
};

export default nextConfig;
