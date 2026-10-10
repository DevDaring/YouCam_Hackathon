import { createContext, useContext } from 'react'
import type { AuthUser } from './api'

export type Status = 'loading' | 'authenticated' | 'anonymous'

export interface AuthState {
  user: AuthUser | null
  status: Status
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Only allow same-site relative redirects after login. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/start'
  return raw
}
