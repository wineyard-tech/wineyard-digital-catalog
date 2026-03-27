import type { Metadata, Viewport } from 'next'
import './globals.css'
import { CartProvider } from '../components/cart/CartContext'
import { PricingProvider } from '../contexts/PricingContext'

export const metadata: Metadata = {
  title: 'WineYard Catalog',
  description: 'WineYard CCTV product catalog for integrators',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'WineYard',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0066CC',
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
        <PricingProvider>
          <CartProvider>
            {children}
          </CartProvider>
        </PricingProvider>
      </body>
    </html>
  )
}
