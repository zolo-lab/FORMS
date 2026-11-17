import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@neondatabase/serverless", "web-push", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/s/[token]/submit": ["./assets/Heebo-Regular.ttf"],
  },
};

export default nextConfig;
