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
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  if (!res.ok) throw new ApiError(res.status, `${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
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
