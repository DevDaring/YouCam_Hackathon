import { motion } from 'framer-motion'
import { Eye, EyeOff, KeyRound, LogIn, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { GoldRule, Paisley, Rosette } from '../components/Motifs'
import { buttonClass, cardClass, fieldClass } from '../components/ui'
import { ApiError, getDemoCredentials, type DemoCredentials } from '../lib/api'
import { safeNext, useAuth } from '../lib/useAuth'

export default function Login() {
  const { t } = useTranslation()
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState<DemoCredentials | null>(null)
  const [filled, setFilled] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    getDemoCredentials(ctrl.signal)
      .then(setDemo)
      .catch(() => setDemo({ enabled: false }))
    return () => ctrl.abort()
  }, [])

  if (status === 'authenticated') return <Navigate to={next} replace />

  function fillDemo() {
    if (!demo?.username || !demo.password) return
    setUsername(demo.username)
    setPassword(demo.password)
    setError(null)
    setFilled(true)
    submitRef.current?.focus()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(next, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t('auth.errorInvalid'))
      else if (err instanceof ApiError && err.status === 429) setError(t('auth.errorRateLimited'))
      else setError(t('auth.errorGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="login-title" className="relative mx-auto max-w-md px-4 py-10 sm:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 mx-auto size-64 rounded-full bg-accent/25 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative"
      >
        <div className="flex flex-col items-center text-center">
          <LogoMark className="size-20 drop-shadow-sm" />
          <h1 id="login-title" className="mt-4 text-3xl font-bold sm:text-4xl">
            {t('auth.title')}
          </h1>
          <GoldRule className="mx-auto" />
          <p className="mt-4 text-muted">{t('auth.subtitle')}</p>
        </div>

        {demo?.enabled ? (
          <div className="relative mt-8 overflow-hidden rounded-3xl border-2 border-dashed border-rule bg-accent-soft p-5">
            <Rosette size={120} className="pointer-events-none absolute -right-8 -top-8 text-rule opacity-[0.15]" />
            <p className="relative flex items-center gap-2 font-semibold text-on-accent">
              <Sparkles aria-hidden="true" className="size-5" />
              {t('auth.demoTitle')}
            </p>
            <p className="relative mt-1 text-sm text-on-accent">{t('auth.demoBody')}</p>
            <dl className="relative mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-on-accent">{t('auth.username')}</dt>
              <dd className="font-mono font-semibold text-heading">{demo.username}</dd>
              <dt className="text-on-accent">{t('auth.password')}</dt>
              <dd className="font-mono font-semibold text-heading">{demo.password}</dd>
            </dl>
            <button type="button" onClick={fillDemo} className={`${buttonClass.secondary} relative mt-4 w-full`}>
              <KeyRound aria-hidden="true" className="size-5" />
              {filled ? t('auth.demoFilled') : t('auth.demoFill')}
            </button>
          </div>
        ) : null}

        <form onSubmit={onSubmit} noValidate className={`${cardClass} mt-6 space-y-4`}>
          <div>
            <label htmlFor="login-username" className="mb-1.5 block text-sm font-semibold text-heading">
              {t('auth.username')}
            </label>
            <input
              id="login-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setFilled(false)
              }}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-heading">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setFilled(false)
                }}
                className={`${fieldClass} pr-14`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-1 my-auto inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-heading focus-visible:outline-3 focus-visible:outline-focus"
              >
                {showPassword ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
              </button>
            </div>
          </div>

          <p role="alert" aria-live="assertive" className={error ? 'rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger' : 'sr-only'}>
            {error ?? ''}
          </p>

          <button
            ref={submitRef}
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className={`${buttonClass.primary} w-full`}
          >
            <LogIn aria-hidden="true" className="size-5" />
            {submitting ? t('auth.submitting') : t('auth.submit')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">{t('auth.familyNote')}</p>
        <Paisley size={90} className="pointer-events-none mx-auto mt-6 text-rule opacity-[0.15]" />
      </motion.div>
    </section>
  )
}
