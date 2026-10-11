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

// ---------------------------------------------------------------- Look Studio

export type Wear = 'women' | 'men'
export type LayerName = 'outfit' | 'necklace' | 'earrings' | 'makeup' | 'hair'
export type LayerStatus = 'pending' | 'rendering' | 'done' | 'failed' | 'skipped'
export type LookPreset = 'sindoor_dusk' | 'marigold_morning' | 'ivory_moon'

export interface LookItem {
  id: string
  sku: string
  name: string
  /** Decimal string in the session currency; null when the item has no price in this country. */
  price: string | null
  image_url: string
  metal: string | null
  licence: string | null
}

export interface LookLayer {
  layer: LayerName
  status: LayerStatus
  /** Machine code: "no_face", "budget", "interrupted", or a YouCam error code. */
  error: string | null
  units: number
  render_url: string | null
  item: LookItem | null
  params: { template_id: string | null } | null
}

export interface Look {
  id: string
  slot: 1 | 2 | 3
  preset: LookPreset
  status: string
  total_price: string | null
  currency: string
  over_budget: boolean
  image_url: string | null
  layers_done: number
  layers_total: number
  layers: LookLayer[]
}

export interface LooksPayload {
  wear: Wear | null
  /** 0 until the first set of looks is planned. */
  round: number
  rounds_left: number
  rendering: boolean
  looks: Look[]
}

export function getLooks(sessionId: string, signal?: AbortSignal): Promise<LooksPayload> {
  return request<LooksPayload>(`/api/sessions/${encodeURIComponent(sessionId)}/looks`, { signal })
}

/** Plans and starts rendering. Idempotent unless `replan` is set (which spends a round). */
export function startLooks(sessionId: string, body: { wear?: Wear; replan?: boolean } = {}): Promise<LooksPayload> {
  return request<LooksPayload>(`/api/sessions/${encodeURIComponent(sessionId)}/looks`, { method: 'POST', body: JSON.stringify(body) })
}

/** Re-renders a look from its first failed or skipped layer. */
export function retryLook(lookId: string): Promise<LooksPayload> {
  return request<LooksPayload>(`/api/looks/${encodeURIComponent(lookId)}/retry`, { method: 'POST' })
}
