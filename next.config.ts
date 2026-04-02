import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow serving uploaded files from /uploads
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/api/uploads/:path*',
      },
    ];
  },

  // Redirect old auth URLs to new dashboard auth paths
  async redirects() {
    return [
      {
        source: '/forgot-password',
        destination: '/dashboard/forgot-password',
        permanent: true,
      },
      {
        source: '/reset-password',
        destination: '/dashboard/reset-password',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
