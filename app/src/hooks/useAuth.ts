// Re-exports AuthContext so existing call sites need no changes.
// All auth state is now shared via AuthProvider in the root layout.
export { useAuthContext as useAuth, type AuthUser, type SendOTPResult, type VerifyOTPResult } from '@/contexts/AuthContext'
