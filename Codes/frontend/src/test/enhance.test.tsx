import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import i18n from '../i18n'
import type { LayerName, Look, LooksPayload } from '../lib/api'
import { AuthProvider } from '../lib/auth'
import { RegionProvider } from '../lib/region'

const REGIONS = {
  countries: [{ code: 'IN', currency: 'INR', locales: ['en', 'hi', 'bn'], timezones: ['Asia/Kolkata'], events: ['wedding'], budget_presets: [75000], cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }] }],
  events: {},
}
const FULL = { kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=1', quality: null, enhanced: false, enhanced_by: null }
const SESSION = {
  id: 's1', country_code: 'IN', city: 'Kolkata', role: 'bride', event_type: 'wedding', event_date: '2027-02-14', budget_amount: '75000',
  currency: 'INR', style_tags: ['traditional'], delete_after: null, photos: [FULL],
}
const WOMEN: LayerName[] = ['outfit', 'necklace', 'earrings', 'makeup', 'hair']
const ORIGINAL = '/api/looks/L1/image?layer=4&v=1'
const ENHANCED = '/api/looks/L1/enhanced?v=9'

function look(slot: 1 | 2 | 3, enh: Partial<Look> = {}): Look {
  const id = `L${slot}`
  const layers = WOMEN.map((layer, i) => ({
    layer, status: 'done' as const, error: null, units: 0, render_url: `/api/looks/${id}/image?layer=${i}&v=1`, item: null, params: null,
  }))
  return {
    id, slot, preset: (['sindoor_dusk', 'marigold_morning', 'ivory_moon'] as const)[slot - 1], status: 'draft',
    total_price: '74999', currency: 'INR', over_budget: false, image_url: `/api/looks/${id}/image?layer=4&v=1`,
    layers_done: 5, layers_total: 5, layers,
    enhance_status: null, enhance_error: null, enhanced_by: null, enhanced_url: null, ...enh,
  }
}
function payload(l1: Partial<Look> = {}, extra: Partial<LooksPayload> = {}): LooksPayload {
  return { wear: 'women', round: 1, rounds_left: 2, rendering: false, edits_left: 10, looks: [look(1, l1), look(2), look(3)], ...extra }
}
const RUNNING: Partial<Look> = { enhance_status: 'running' }
const DONE: Partial<Look> = { enhance_status: 'done', enhanced_by: 'youcam', enhanced_url: ENHANCED }

type Call = { url: string; method: string }
function mockApi(routes: (url: string, method: string) => unknown) {
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    if (url.startsWith('/api/regions')) return json(REGIONS)
    if (url.startsWith('/api/geo/guess')) return json({ country_code: 'IN', source: 'timezone' })
    if (url.startsWith('/api/auth/me')) return json({ username: 'TestUser', display_name: 'Jury demo', is_demo: true })
    calls.push({ url, method })
    const out = routes(url, method)
    if (out instanceof Response) return out
    return out === undefined ? json({}, 404) : json(out)
  })
  return calls
}

function renderAt(path: string) {
  return render(
    <StrictMode>
      <RegionProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </RegionProvider>
    </StrictMode>,
  )
}

const lookImage = () => screen.getByRole('button', { name: 'Open Sindoor Dusk layer by layer' }).querySelector('img:not([aria-hidden])') as HTMLImageElement

describe('enhance a look', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })
  afterEach(() => vi.useRealTimers())

  it('POSTs, polls until done, shows the enhanced image with a before/after toggle, then removes it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let state: 'none' | 'running' | 'done' = 'none'
    const calls = mockApi((url, method) => {
      if (url === '/api/sessions/s1') return SESSION
      if (url === '/api/looks/L1/enhance' && method === 'POST') {
        state = 'running'
        return payload(RUNNING, { rendering: true, edits_left: 9 })
      }
      if (url === '/api/looks/L1/enhance' && method === 'DELETE') {
        state = 'none'
        return payload({}, { edits_left: 9 })
      }
      if (url === '/api/sessions/s1/looks') {
        if (state === 'running') {
          state = 'done' // finishes by the next poll
          return payload(RUNNING, { rendering: true, edits_left: 9 })
        }
        return payload(state === 'done' ? DONE : {}, { edits_left: state === 'none' ? 10 : 9 })
      }
    })
    renderAt('/studio/s1')
    const btn = await screen.findByRole('button', { name: 'Enhance photo: Sindoor Dusk' })
    expect(screen.getAllByText('Sharpens detail and clarity · 2 YouCam units').length).toBe(3)
    fireEvent.click(btn)
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/looks/L1/enhance')).toBe(true))
    expect(await screen.findByText('Enhancing Sindoor Dusk — this takes a few seconds')).toBeTruthy()
    expect(screen.getAllByText('Enhancing…').length).toBeGreaterThan(0)
    // Editing waits while the enhancement runs.
    expect(screen.queryByRole('button', { name: 'Change necklace for Look 1' })?.hasAttribute('disabled')).toBe(true)

    await act(() => vi.advanceTimersByTimeAsync(3100))
    await act(() => vi.advanceTimersByTimeAsync(3100))
    const group = await screen.findByRole('group', { name: 'Compare Sindoor Dusk before and after enhancing' })
    expect(lookImage().getAttribute('src')).toBe(ENHANCED)
    expect(lookImage().getAttribute('alt')).toMatch(/, enhanced$/)
    expect(screen.getByText('by YouCam')).toBeTruthy()
    const after = within(group).getByRole('button', { name: 'After' })
    expect(after.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(group).getByRole('button', { name: 'Before' }))
    expect(lookImage().getAttribute('src')).toBe(ORIGINAL)
    expect(after.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(after)
    expect(lookImage().getAttribute('src')).toBe(ENHANCED)

    // The lightbox ends on the enhanced image.
    fireEvent.click(screen.getByRole('button', { name: 'Open Sindoor Dusk layer by layer' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Sindoor Dusk' }))
    expect(dialog.getByText('Step 7 of 7')).toBeTruthy()
    expect(dialog.getByRole('img', { name: 'Sindoor Dusk look, Enhanced' }).getAttribute('src')).toBe(ENHANCED)
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Remove enhancement: Sindoor Dusk' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/looks/L1/enhance')).toBe(true))
    expect(await screen.findByText('Enhancement removed from Sindoor Dusk')).toBeTruthy()
    expect(screen.queryByRole('group', { name: /Compare Sindoor Dusk/ })).toBeNull()
    expect(lookImage().getAttribute('src')).toBe(ORIGINAL)
  })

  it('explains a failed enhancement and retries it', async () => {
    const calls = mockApi((url, method) => {
      if (url === '/api/sessions/s1') return SESSION
      if (url === '/api/looks/L1/enhance' && method === 'POST') return payload(RUNNING, { rendering: true })
      if (url === '/api/sessions/s1/looks') return payload({ enhance_status: 'failed', enhance_error: 'timeout' })
    })
    renderAt('/studio/s1')
    expect(await screen.findByText("We couldn't enhance this photo. Please try again.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try enhancing again: Sindoor Dusk' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/looks/L1/enhance')).toHaveLength(1))
  })

  it('shows a friendly toast when the edit allowance is used up', async () => {
    mockApi((url, method) => {
      if (url === '/api/sessions/s1') return SESSION
      if (url === '/api/looks/L2/enhance' && method === 'POST') return new Response('{"detail":"edit_limit"}', { status: 429 })
      if (url === '/api/sessions/s1/looks') return payload()
    })
    renderAt('/studio/s1')
    fireEvent.click(await screen.findByRole('button', { name: 'Enhance photo: Marigold Morning' }))
    expect(await screen.findByText("You've used all edits for this session.")).toBeTruthy()
  })
})

describe('enhance a photo', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })

  const SOFT = {
    kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=orig', enhanced: false, enhanced_by: null,
    quality: { ok: true, checks: [{ key: 'light', status: 'pass', value: 120 }, { key: 'sharp', status: 'warn', value: 40 }] },
  }
  const SHARP = {
    ...SOFT, url: '/api/sessions/s1/photos/full?v=enh', enhanced: true, enhanced_by: 'youcam',
    quality: { ok: true, checks: [{ key: 'light', status: 'pass', value: 120 }, { key: 'sharp', status: 'pass', value: 400 }] },
  }

  it('suggests enhancing a soft photo, POSTs, updates the preview and checks, then restores the original', async () => {
    const calls = mockApi((url, method) => {
      if (url === '/api/sessions/s1') return { ...SESSION, photos: [SOFT] }
      if (url === '/api/sessions/s1/photos/full/enhance' && method === 'POST') return SHARP
      if (url === '/api/sessions/s1/photos/full/restore' && method === 'POST') return SOFT
    })
    renderAt('/photo/s1')
    expect(await screen.findByText('Your photo looks a little soft — enhance it for sharper try-ons.')).toBeTruthy()
    expect(screen.getByText('A little blurry — hold steady or use the timer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enhance photo' }))
    expect(await screen.findByText('Usually a few seconds — occasionally up to a minute.')).toBeTruthy()

    expect(await screen.findByText('Sharp and clear')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/sessions/s1/photos/full/enhance')).toBe(true)
    expect(screen.getByRole('img', { name: 'Your full-length photo' }).getAttribute('src')).toBe(SHARP.url)
    expect(screen.getByText('Enhanced')).toBeTruthy()
    expect(screen.getByText('by YouCam')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Enhance photo' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Restore original' }))
    expect(await screen.findByText('A little blurry — hold steady or use the timer')).toBeTruthy()
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/sessions/s1/photos/full/restore')).toBe(true)
    expect(screen.getByRole('img', { name: 'Your full-length photo' }).getAttribute('src')).toBe(SOFT.url)
  })

  it('keeps the original and explains when enhancing fails', async () => {
    mockApi((url, method) => {
      if (url === '/api/sessions/s1') return { ...SESSION, photos: [{ ...SHARP, enhanced: false, enhanced_by: null }] }
      if (url === '/api/sessions/s1/photos/full/enhance' && method === 'POST') return new Response('{"detail":"enhance_failed: timeout"}', { status: 502 })
    })
    renderAt('/photo/s1')
    // A sharp, well-lit photo gets the quieter secondary button.
    expect(await screen.findByText('Sharpens detail and clarity for crisper try-ons')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enhance photo' }))
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't enhance this photo. Your original is unchanged — please try again.")
    expect(screen.getByRole('img', { name: 'Your full-length photo' })).toBeTruthy()
  })

  it('marks enhanced photos in the studio photos panel', async () => {
    mockApi((url) => {
      if (url === '/api/sessions/s1') return { ...SESSION, photos: [SHARP] }
      if (url === '/api/sessions/s1/looks') return payload()
    })
    renderAt('/studio/s1')
    const panel = await screen.findByRole('region', { name: 'Your photos' })
    expect(within(panel).getByText('Enhanced')).toBeTruthy()
  })
})
