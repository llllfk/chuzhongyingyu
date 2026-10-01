import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['coze-coding-dev-sdk'],
  turbopack: {},
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
