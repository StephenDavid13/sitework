import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

export default function config(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  // The browser always calls same-origin `/api/...`. In Kubernetes the ingress routes
  // `/api` to the .NET service; locally, Next proxies it to the API instead.
  const apiProxyUrl =
    process.env.API_PROXY_URL ?? (isDev ? "http://localhost:5080" : undefined);

  // Map styles, tiles, glyphs and sprites all come from the tile host.
  const mapOrigin = new URL(
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEFAULT_MAP_STYLE,
  ).origin;

  const contentSecurityPolicy = [
    "default-src 'self'",
    // Next.js inlines its bootstrap scripts; dev mode also needs eval for fast refresh.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${mapOrigin}`,
    "font-src 'self'",
    `connect-src 'self' ${mapOrigin}${isDev ? " ws:" : ""}`,
    // MapLibre starts its worker from a blob: URL that imports /maplibre-gl-worker.mjs.
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  return {
    output: "standalone",
    poweredByHeader: false,
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
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "Content-Security-Policy", value: contentSecurityPolicy },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "DENY" },
            {
              key: "Referrer-Policy",
              value: "strict-origin-when-cross-origin",
            },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), payment=(), geolocation=(self)",
            },
            // Ignored over plain HTTP, enforced once served via the HTTPS load balancer.
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains",
            },
          ],
        },
      ];
    },
    async redirects() {
      return [{ source: "/", destination: "/jobs", permanent: false }];
    },
    async rewrites() {
      return apiProxyUrl
        ? [{ source: "/api/:path*", destination: `${apiProxyUrl}/api/:path*` }]
        : [];
    },
  };
}
