'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export interface AuthUser {
  zoho_contact_id: string
  contact_name: string
  company_name: string | null
  contact_person_name: string | null
  phone: string
  pricebook_id: string | null
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  isRegistered: boolean
}

interface AuthContextValue extends AuthState {
  sendOTP: (phoneNumber: string) => Promise<SendOTPResult>
  verifyOTP: (phoneNumber: string, otp: string) => Promise<VerifyOTPResult | void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  /** Called immediately after successful OTP verification — sets user without another network call. */
  setAuthenticatedUser: (user: AuthUser) => void
}

export interface SendOTPResult {
  registered: boolean
  expiresIn?: number
  error?: string
}

export interface VerifyOTPResult {
  attemptsLeft?: number
  error?: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthenticated: false,
    isRegistered: false,
  })

  useEffect(() => {
    let cancelled = false
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { user: AuthUser }
          setState({ user: data.user, loading: false, isAuthenticated: true, isRegistered: true })
        } else if (!cancelled) {
          setState({ user: null, loading: false, isAuthenticated: false, isRegistered: false })
        }
      } catch {
        if (!cancelled) {
          setState({ user: null, loading: false, isAuthenticated: false, isRegistered: false })
        }
      }
    }
    checkSession()
    return () => { cancelled = true }
  }, [])

  const setAuthenticatedUser = useCallback((user: AuthUser) => {
    setState({ user, loading: false, isAuthenticated: true, isRegistered: true })
  }, [])

  const sendOTP = useCallback(async (phoneNumber: string): Promise<SendOTPResult> => {
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    })
    const data = (await res.json()) as SendOTPResult & { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Failed to send OTP')
    return data
  }, [])

  const verifyOTP = useCallback(async (phoneNumber: string, otp: string): Promise<VerifyOTPResult | void> => {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, otpCode: otp }),
    })
    const data = (await res.json()) as { success?: boolean; user?: AuthUser } & VerifyOTPResult

    if (res.ok && data.success && data.user) {
      setState({ user: data.user, loading: false, isAuthenticated: true, isRegistered: true })
      return
    }
    return { attemptsLeft: data.attemptsLeft, error: data.error }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Dynamic import keeps posthog-js out of module-level SSR evaluation
    import('posthog-js').then(({ default: posthog }) => posthog.reset()).catch(() => {})
    setState({ user: null, loading: false, isAuthenticated: false, isRegistered: false })
  }, [])

  const refreshSession = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/auth/refresh', { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { user: AuthUser }
      setState((prev) => ({ ...prev, user: data.user }))
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, sendOTP, verifyOTP, logout, refreshSession, setAuthenticatedUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
