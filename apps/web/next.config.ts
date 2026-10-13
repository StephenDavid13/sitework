import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// The browser always calls same-origin `/api/...`. In Kubernetes the ingress routes
// `/api` to the .NET service; locally, Next proxies it to the API instead.
export default function config(phase: string): NextConfig {
  const apiProxyUrl =
    process.env.API_PROXY_URL ??
    (phase === PHASE_DEVELOPMENT_SERVER ? "http://localhost:5080" : undefined);

  return {
    output: "standalone",
    cacheComponents: true,
    partialPrefetching: true,
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
    async rewrites() {
      return apiProxyUrl
        ? [{ source: "/api/:path*", destination: `${apiProxyUrl}/api/:path*` }]
        : [];
    },
  };
}
