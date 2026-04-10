import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '../contexts/AuthContext'
import PostHogProvider from '../components/analytics/PostHogProvider'
import { CartProvider } from '../components/cart/CartContext'
import { PricingProvider } from '../contexts/PricingContext'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: 'Wine Yard Catalog',
  description: 'Wine Yard CCTV product catalog for integrators',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Wine Yard',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#FFFFFF',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <AuthProvider>
          <PostHogProvider>
            <PricingProvider>
              <CartProvider>
                {children}
              </CartProvider>
            </PricingProvider>
          </PostHogProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
