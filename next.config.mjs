/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' }
    ]
  },
  async redirects() {
    return [
      // The old requisitions route is replaced by Requests (spec 16).
      { source: '/bookings', destination: '/requests', permanent: false },
      { source: '/bookings/:path*', destination: '/requests', permanent: false }
    ];
  }
};

export default nextConfig;
