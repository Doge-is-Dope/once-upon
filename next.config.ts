import { SECURITY_HEADER_VALUES } from './lib/security/headers';

const securityHeaders = Object.entries(SECURITY_HEADER_VALUES).map(
  ([key, value]) => ({ key, value }),
);

const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/s/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default nextConfig;
