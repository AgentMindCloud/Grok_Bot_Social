import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "export",
  trailingSlash: true,
  // The native adapter intentionally rejects redirects. Development API calls
  // must reach Fastify unchanged, as they do through Caddy in production.
  skipTrailingSlashRedirect: Boolean(process.env.HUB_DEV_API_URL),
  images: {
    unoptimized: true,
  },
  ...(process.env.HUB_DEV_API_URL
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: process.env.HUB_DEV_API_URL + "/api/:path*",
            },
          ];
        },
      }
    : {}),
  // basePath removed — site now lives at root of bottocks.fun
};

export default nextConfig;
