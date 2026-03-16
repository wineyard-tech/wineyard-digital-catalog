import type { NextConfig } from 'next'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline',
  },
  runtimeCaching: [
    // Network-only for API routes and admin
    {
      urlPattern: /^https?:\/\/.*\/api\//,
      handler: 'NetworkOnly',
    },
    {
      urlPattern: /^https?:\/\/.*\/admin\//,
      handler: 'NetworkOnly',
    },
    // Cache-first for product images from Supabase Storage
    {
      urlPattern: /^https?:\/\/.*\.supabase\.co\/storage\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'supabase-images',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
      },
    },
    // Stale-while-revalidate for catalog pages
    {
      urlPattern: /^https?:\/\/[^/]+\/catalog/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'catalog-pages',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
      },
    },
    // Cache-first for static assets (JS, CSS, fonts)
    {
      urlPattern: /\.(?:js|css|woff2?)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
  ],
})

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

export default withPWA(nextConfig)
