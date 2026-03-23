import type { NextConfig } from 'next'

// next-pwa@2.x API: pass merged PWA + Next config in a single call;
// it returns the final NextConfig (not a wrapper function like v5).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline',
  },
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/.*\/api\//,
      handler: 'NetworkOnly',
    },
    {
      urlPattern: /^https?:\/\/.*\/admin\//,
      handler: 'NetworkOnly',
    },
    {
      urlPattern: /^https?:\/\/.*\.supabase\.co\/storage\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'supabase-images',
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /^https?:\/\/[^/]+\/catalog/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'catalog-pages',
        expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\.(?:js|css|woff2?)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
  ...nextConfig,
})
