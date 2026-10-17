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
  /** True when the shown photo is the sharpened version (the original is kept). */
  enhanced?: boolean
  enhanced_by?: EnhancedBy | null
}

export type EnhancedBy = 'youcam' | 'nanogpt' | 'mock'

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
/** "off" = removed by the shopper: not rendered, can be added back. */
export type LayerStatus = 'pending' | 'rendering' | 'done' | 'failed' | 'skipped' | 'off'
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
  /** Photo enhancement of the latest finished image (cleared by any layer edit or retry). */
  enhance_status?: 'running' | 'done' | 'failed' | null
  enhance_error?: string | null
  enhanced_by?: EnhancedBy | null
  enhanced_url?: string | null
}

export interface LooksPayload {
  wear: Wear | null
  /** 0 until the first set of looks is planned. */
  round: number
  rounds_left: number
  rendering: boolean
  /** Per-session layer edits remaining (absent on older servers). */
  edits_left?: number
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

// ---------------------------------------------------------------- Layer editor

export interface OptionItem {
  id: string
  sku: string
  name: string
  price: string | null
  currency: string
  image_url: string
  metal: string | null
  weight_class: string
  colour_family: string
  licence: string
  event_match: boolean
  current: boolean
}

export interface MakeupPresetOption {
  key: LookPreset
  lip: string
  blush: string
  shadow: string
  current: boolean
}

export interface LipShade {
  key: string
  hex: string
}

export interface HairOption {
  template_id: string
  title: string
  thumb: string
  current: boolean
  /** Neat, close-to-head style (the server lists these first). Absent on older servers. */
  recommended?: boolean
  /** The style keeps the shopper's own hair colour. Absent on older servers. */
  keeps_colour?: boolean
}

export interface LayerOptions {
  layer: LayerName
  enabled: boolean
  removable: boolean
  /** YouCam units this change would spend (this layer + every later enabled layer). */
  units_to_rerender: number
  layers_affected: LayerName[]
  edits_left: number
  items?: OptionItem[]
  makeup?: { presets: MakeupPresetOption[]; lip_shades: LipShade[]; current_preset: string; current_lip: string }
  hair?: HairOption[]
}

/** One change per request. */
export type LayerPatch =
  | { item_id: string }
  | { preset: LookPreset; lip?: string }
  | { lip: string }
  | { template_id: string }
  | { enabled: boolean }

export function getLayerOptions(lookId: string, layer: LayerName, signal?: AbortSignal): Promise<LayerOptions> {
  return request<LayerOptions>(`/api/looks/${encodeURIComponent(lookId)}/options/${layer}`, { signal })
}

/** Applies one change; that layer and every later enabled layer go back to "pending" and re-render. */
export function patchLayer(lookId: string, layer: LayerName, body: LayerPatch): Promise<LooksPayload> {
  return request<LooksPayload>(`/api/looks/${encodeURIComponent(lookId)}/layers/${layer}`, { method: 'PATCH', body: JSON.stringify(body) })
}

// ---------------------------------------------------------------- Enhance

/** Starts sharpening the look's latest finished image (counts as one edit). */
export function enhanceLook(lookId: string): Promise<LooksPayload> {
  return request<LooksPayload>(`/api/looks/${encodeURIComponent(lookId)}/enhance`, { method: 'POST' })
}

/** Drops the enhancement and goes back to the original render. */
export function clearLookEnhance(lookId: string): Promise<LooksPayload> {
  return request<LooksPayload>(`/api/looks/${encodeURIComponent(lookId)}/enhance`, { method: 'DELETE' })
}

/** Sharpens an uploaded photo (synchronous: seconds, up to about a minute on the fallback). */
export function enhancePhoto(sessionId: string, kind: PhotoKind): Promise<PhotoInfo> {
  return request<PhotoInfo>(`/api/sessions/${encodeURIComponent(sessionId)}/photos/${kind}/enhance`, { method: 'POST' })
}

/** Puts the original photo back. */
export function restorePhoto(sessionId: string, kind: PhotoKind): Promise<PhotoInfo> {
  return request<PhotoInfo>(`/api/sessions/${encodeURIComponent(sessionId)}/photos/${kind}/restore`, { method: 'POST' })
}

// ---------------------------------------------------------------- Share

export interface ShareInfo {
  /** Public page with an Open Graph preview of the look (e.g. https://…/s/{token}). */
  url: string
  /** Public JPEG of the look (the enhanced image when enhanced, else the latest render). */
  image_url: string
  title: string
  text: string
  expires_at: string | null
}

/** Creates (or returns the existing) public share link for a look. 409 "nothing_to_share" before any layer renders. */
export function shareLook(lookId: string): Promise<ShareInfo> {
  return request<ShareInfo>(`/api/looks/${encodeURIComponent(lookId)}/share`, { method: 'POST' })
}
