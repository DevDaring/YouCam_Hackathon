import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError, fetchMe, loginRequest, logoutRequest, type AuthUser } from './api'
import { AuthContext, useAuth, type Status } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    const ctrl = new AbortController()
    fetchMe(ctrl.signal)
      .then((u) => {
        setUser(u)
        setStatus('authenticated')
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return
        if (!(err instanceof ApiError)) console.warn('session check failed', err)
        setStatus('anonymous')
      })
    return () => ctrl.abort()
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const u = await loginRequest(username, password)
    setUser(u)
    setStatus('authenticated')
    return u
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Shopper-only pages. The family room (/room/:token) and landing stay public. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-xl px-4 py-12" aria-busy="true">
        <div className="mx-auto h-9 w-2/3 animate-pulse rounded-xl bg-line/60" />
        <div className="mt-8 h-72 animate-pulse rounded-3xl bg-line/40" />
      </div>
    )
  }
  if (status === 'anonymous') {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}
