import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@neondatabase/serverless", "web-push"],
};

export default nextConfig;
