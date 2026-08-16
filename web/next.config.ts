import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Required for GitHub Pages under /bbotbook
  basePath: "/bbotbook",
};

export default nextConfig;
