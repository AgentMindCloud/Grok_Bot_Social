import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",          // static HTML export for GitHub Pages
  trailingSlash: true,       // better compatibility with GH Pages
  images: {
    unoptimized: true,       // required for static export
  },
  // If deploying under https://agentmindcloud.github.io/bbotbook/
  // uncomment the next line after confirming the Pages path:
  // basePath: "/bbotbook",
};

export default nextConfig;
