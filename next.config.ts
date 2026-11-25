import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.vercel.run"],
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;