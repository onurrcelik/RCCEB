const isDev = process.env.NODE_ENV === 'development';

// Uploaded images are served straight from the S3 bucket.
const s3Host = process.env.S3_BUCKET
  ? `${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'eu-central-1'}.amazonaws.com`
  : '';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      // Avatars and event photos come from S3; members also paste LinkedIn photo URLs.
      `img-src 'self' data: blob:${s3Host ? ` https://${s3Host}` : ''} https://media.licdn.com`,
      "font-src 'self' data:",
      `connect-src 'self'${isDev ? ' ws: http://localhost:*' : ''}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(isDev ? [] : ['upgrade-insecure-requests']),
    ].join('; '),
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: s3Host ? [{ protocol: 'https', hostname: s3Host }] : [],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
