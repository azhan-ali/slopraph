import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables standalone output for Docker deployment (copies only required files).
  output: "standalone",
};

export default nextConfig;
