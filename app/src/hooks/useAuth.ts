'use client'

import { useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  zoho_contact_id: string
  contact_name: string
  company_name: string | null
  phone: string
  pricebook_id: string | null
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: boolean
  isRegistered: boolean
}

export interface SendOTPResult {
  registered: boolean
  expiresIn?: number   // seconds
  error?: string
}

export interface VerifyOTPResult {
  attemptsLeft?: number
  error?: string
}

/**
 * Auth state hook for the WineYard integrator-facing catalog.
 *
 * On mount: calls /api/auth/refresh to check for a live session.
 * Exposes sendOTP, verifyOTP, logout, and refreshSession actions.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthenticated: false,
    isRegistered: false,
  })

  // Check for existing session on app load
  useEffect(() => {
    let cancelled = false
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { user: AuthUser }
          setState({
            user: data.user,
            loading: false,
            isAuthenticated: true,
            isRegistered: true,
          })
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

  const verifyOTP = useCallback(
    async (phoneNumber: string, otp: string): Promise<VerifyOTPResult | void> => {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, otpCode: otp }),
      })
      const data = (await res.json()) as {
        success?: boolean
        user?: AuthUser
      } & VerifyOTPResult

      if (res.ok && data.success && data.user) {
        setState({
          user: data.user,
          loading: false,
          isAuthenticated: true,
          isRegistered: true,
        })
        return // success — no error result
      }

      return { attemptsLeft: data.attemptsLeft, error: data.error }
    },
    [],
  )

  const logout = useCallback(async (): Promise<void> => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setState({ user: null, loading: false, isAuthenticated: false, isRegistered: false })
  }, [])

  const refreshSession = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/auth/refresh', { method: 'POST' })
    if (res.ok) {
      const data = (await res.json()) as { user: AuthUser }
      setState((prev) => ({ ...prev, user: data.user }))
    }
  }, [])

  return {
    ...state,
    sendOTP,
    verifyOTP,
    logout,
    refreshSession,
  }
}
