// TODO: Implement — see architecture docs §6 Key User Flows (root layout with CartProvider)
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WineYard Catalog',
  description: 'WineYard CCTV product catalog',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
