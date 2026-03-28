'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '../../../lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }
    router.replace('/admin/enquiries')
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#F8FAFB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
          padding: 32,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <Image
              src="/wine-yard-logo.png"
              alt="Wine Yard Technologies"
              width={140}
              height={100}
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#1A1A2E' }}>Admin Login</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>Wine Yard Catalog Management</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@wineyard.in"
              style={{
                width: '100%',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p style={{ margin: '0 0 16px', padding: '8px 12px', background: '#FEF2F2', color: '#DC2626', borderRadius: 8, fontSize: 13 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#9CA3AF' : '#0066CC',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              padding: '13px 0',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  )
}
