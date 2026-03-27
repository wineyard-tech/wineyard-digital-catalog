// ARCHIVED: Category detail view replaced by category tab in Home screen.
// See app/src/components/catalog/HomeClient.tsx for the new implementation.

export default function CategoryClient(_props: { categoryName: string; contactName: string | null; initialItems: never[] }) {
  return null
}

/*
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CatalogItem } from '@/types/catalog'
import ProductGrid from '@/components/catalog/ProductGrid'

interface CategoryClientProps {
  categoryName: string
  contactName: string | null
  initialItems: CatalogItem[]
}

export default function CategoryClient({ categoryName, initialItems }: CategoryClientProps) {
  // ... archived implementation ...
}
*/
