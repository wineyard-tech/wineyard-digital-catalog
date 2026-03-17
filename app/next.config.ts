import path from 'node:path'
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
  webpack: (config, { dir }) => {
    // `next-pwa` runs a webpack pass even in dev for service-worker pre-caching.
    // When the dev server is started via `npm --prefix app`, process.cwd() stays
    // at the repo root, so webpack resolves modules from there — where tailwindcss
    // doesn't exist.  Explicitly prepend the project's own node_modules so
    // resolution always starts in the right place.
    config.resolve = {
      ...config.resolve,
      modules: [
        path.resolve(dir, 'node_modules'),
        ...(Array.isArray(config.resolve?.modules)
          ? config.resolve.modules
          : ['node_modules']),
      ],
    }
    return config
  },
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
