import type { ReactNode } from 'react'
import { APP_COLUMN_MAX_PX } from '@/lib/app-column'

export default function AppColumn({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        maxWidth: APP_COLUMN_MAX_PX,
        margin: '0 auto',
        width: '100%',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  )
}
