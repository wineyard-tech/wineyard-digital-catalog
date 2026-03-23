// Server component — checks session and redirects authenticated users
// so the login page is never shown to someone who's already logged in.
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import LoginClient from './LoginClient'

export default async function LoginPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value
  if (token) {
    const session = await getSession(token)
    if (session) redirect('/catalog')
  }
  return <LoginClient />
}
