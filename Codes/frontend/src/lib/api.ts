export interface City {
  name: string
  lat: number
  lon: number
}

export interface Country {
  code: string
  currency: string
  locales: string[]
  timezones: string[]
  events: string[]
  budget_presets: number[]
  cities: City[]
}

export interface RegionsResponse {
  countries: Country[]
  events: Record<string, { tags: string[] }>
}

export interface GeoResolveResponse {
  country_code: string | null
  city: string | null
  distance_km: number
  supported: boolean
  source: string
}

export interface GeoGuessResponse {
  country_code: string
  source: 'timezone'
}

export class ApiError extends Error {
  readonly status: number
  /** Server's machine-readable `detail` (e.g. "too_small"), when it sent one. */
  readonly detail: string
  constructor(status: number, message: string, detail = '') {
    super(message)
    this.status = status
    this.detail = detail
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      Accept: 'application/json',
      ...(typeof init?.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail || `${init?.method ?? 'GET'} ${path} failed: ${res.status}`, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function getRegions(signal?: AbortSignal): Promise<RegionsResponse> {
  return request<RegionsResponse>('/api/regions', { signal })
}

/** Returns null when the backend has no country for this timezone (404). */
export async function guessCountry(tz: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const data = await request<GeoGuessResponse>(`/api/geo/guess?tz=${encodeURIComponent(tz)}`, { signal })
    return data.country_code
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export function resolveLocation(lat: number, lon: number): Promise<GeoResolveResponse> {
  return request<GeoResolveResponse>('/api/geo/resolve', {
    method: 'POST',
    body: JSON.stringify({ lat, lon }),
  })
}

export interface AuthUser {
  username: string
  display_name: string | null
  is_demo: boolean
}

export interface DemoCredentials {
  enabled: boolean
  username?: string
  password?: string
}

export function fetchMe(signal?: AbortSignal): Promise<AuthUser> {
  return request<AuthUser>('/api/auth/me', { signal })
}

export function loginRequest(username: string, password: string): Promise<AuthUser> {
  return request<AuthUser>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function logoutRequest(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' })
}

export function getDemoCredentials(signal?: AbortSignal): Promise<DemoCredentials> {
  return request<DemoCredentials>('/api/auth/demo', { signal })
}

export type PhotoKind = 'full' | 'face'

export interface QualityCheck {
  key: 'light' | 'sharp' | 'face' | 'face_size' | 'framing'
  status: 'pass' | 'warn' | 'fail'
  value: number | null
}

export interface PhotoInfo {
  kind: PhotoKind
  width: number | null
  height: number | null
  url: string
  quality: { ok: boolean; checks: QualityCheck[]; source?: string } | null
}

export interface SessionInfo {
  id: string
  country_code: string
  city: string | null
  role: string
  event_type: string
  event_date: string | null
  budget_amount: string | null
  currency: string
  style_tags: string[]
  delete_after: string | null
  photos: PhotoInfo[]
}

export interface NewSession {
  country_code: string
  city: string | null
  location_source: string
  role: string
  event_type: string
  event_date: string | null
  budget_amount: number | null
  currency: string
  locale: string
  style_tags: string[]
  consent: boolean
}

export function createSession(body: NewSession): Promise<SessionInfo> {
  return request<SessionInfo>('/api/sessions', { method: 'POST', body: JSON.stringify(body) })
}

export function getSession(id: string, signal?: AbortSignal): Promise<SessionInfo> {
  return request<SessionInfo>(`/api/sessions/${encodeURIComponent(id)}`, { signal })
}

export function getLatestSession(signal?: AbortSignal): Promise<SessionInfo> {
  return request<SessionInfo>('/api/sessions/latest', { signal })
}

export function uploadPhoto(sessionId: string, kind: PhotoKind, file: Blob, source: 'camera' | 'upload'): Promise<PhotoInfo> {
  const form = new FormData()
  form.append('kind', kind)
  form.append('source', source)
  form.append('file', file, source === 'camera' ? `${kind}.jpg` : (file as File).name || `${kind}.jpg`)
  return request<PhotoInfo>(`/api/sessions/${encodeURIComponent(sessionId)}/photos`, { method: 'POST', body: form })
}
