import type { NextConfig } from "next";

// Note: cacheComponents is intentionally OFF — this is an internal dashboard with
// per-request DB reads; keep data fetching simple (dynamic by default).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Fonts for PDF stamping are read from disk at runtime.
  outputFileTracingIncludes: {
    "/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
