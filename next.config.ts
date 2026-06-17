import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-alert-dialog', '@radix-ui/react-tooltip', '@radix-ui/react-tabs'],
  },
};
export default nextConfig;
