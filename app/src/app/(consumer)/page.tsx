// app/src/app/page.tsx
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'

export default async function RootPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value

  if (token) {
    const session = await getSession(token)
    if (session) {
      redirect('/location')
    }
  }

  redirect('/auth/login')
}
