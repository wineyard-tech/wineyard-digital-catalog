// auth/browse/page.tsx
// Redirects unregistered users to catalog in browse mode.
// Catalog reads ?mode=browse and shows general pricing + a registration banner.
// Cart, estimates, and order features are hidden in browse mode.

import { redirect } from 'next/navigation'

export default function BrowsePage() {
  redirect('/catalog?mode=browse')
}
