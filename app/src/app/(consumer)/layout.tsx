import type { ReactNode } from 'react'
import AppColumn from '@/components/layout/AppColumn'

export default function ConsumerLayout({ children }: { children: ReactNode }) {
  return <AppColumn>{children}</AppColumn>
}
