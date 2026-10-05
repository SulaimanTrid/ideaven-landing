import type { NextConfig } from "next";

/**
 * Baseline security headers. TASK 68 queue: a real Content-Security-Policy
 * now ships, with the allowances the product actually needs (documented,
 * not blanket 'unsafe-everything'):
 *  - 'unsafe-inline'/'unsafe-eval' scripts: Next's inline bootstrap and dev
 *    tooling; Monaco's CDN loader in Code mode.
 *  - cdn.jsdelivr.net: the Monaco editor loader (Code mode).
 *  - connect-src https: + the dev API origins: the API URL is configurable
 *    via NEXT_PUBLIC_API_URL (same-origin in production, cross-origin in
 *    local dev).
 *  - img-src data:/blob:/https:: QR data URLs, blob downloads, remote
 *    asset/media sources.
 * A nonce-based script policy (dropping 'unsafe-inline') is the next step
 * once every inline bootstrap moves behind the middleware.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https: http://localhost:8090 http://127.0.0.1:8090",
      "font-src 'self' data:",
      "connect-src 'self' https: http://localhost:8090 http://127.0.0.1:8090 ws: wss:",
      "worker-src 'self' blob:",
      "media-src 'self' blob: https:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@ideaven/ui"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
