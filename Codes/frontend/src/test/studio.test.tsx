import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import i18n from '../i18n'
import type { LayerName, LayerStatus, Look, LooksPayload } from '../lib/api'
import { AuthProvider } from '../lib/auth'
import { RegionProvider } from '../lib/region'

const REGIONS = {
  countries: [{ code: 'IN', currency: 'INR', locales: ['en', 'hi', 'bn'], timezones: ['Asia/Kolkata'], events: ['wedding'], budget_presets: [75000], cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }] }],
  events: {},
}
const FULL = { kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=1', quality: null }
const SESSION = {
  id: 's1', country_code: 'IN', city: 'Kolkata', role: 'bride', event_type: 'wedding', event_date: '2027-02-14', budget_amount: '75000',
  currency: 'INR', style_tags: ['traditional'], delete_after: null, photos: [FULL],
}
const WOMEN: LayerName[] = ['outfit', 'necklace', 'earrings', 'makeup', 'hair']
const NAMES: Partial<Record<LayerName, [string, string]>> = {
  outfit: ['Red Banarasi saree', '52000'],
  necklace: ['Kundan choker', '15999'],
  earrings: ['Jhumka pair', '7000'],
}

function look(slot: 1 | 2 | 3, statuses: LayerStatus[], opts: { errors?: (string | null)[]; layers?: LayerName[]; total?: string; over?: boolean } = {}): Look {
  const names = opts.layers ?? WOMEN
  const id = `L${slot}`
  const layers = names.map((layer, i) => {
    const s = statuses[i] ?? 'pending'
    const meta = NAMES[layer]
    return {
      layer,
      status: s,
      error: opts.errors?.[i] ?? null,
      units: 0,
      render_url: s === 'done' ? `/api/looks/${id}/image?layer=${i}&v=1` : null,
      item: meta ? { id: `${layer}-${slot}`, sku: `SKU-${layer}`, name: meta[0], price: meta[1], image_url: `/api/catalogue/${layer}-${slot}/image`, metal: null, licence: 'ai' } : null,
      params: layer === 'hair' ? { template_id: 'x' } : null,
    }
  })
  const done = layers.filter((l) => l.status === 'done')
  return {
    id, slot, preset: (['sindoor_dusk', 'marigold_morning', 'ivory_moon'] as const)[slot - 1], status: 'draft',
    total_price: opts.total ?? '74999', currency: 'INR', over_budget: opts.over ?? false,
    image_url: done.length ? done[done.length - 1].render_url : null,
    layers_done: done.length, layers_total: layers.length, layers,
  }
}

function payload(looks: Look[], extra: Partial<LooksPayload> = {}): LooksPayload {
  return { wear: 'women', round: looks.length ? 1 : 0, rounds_left: looks.length ? 2 : 3, rendering: false, looks, ...extra }
}

type Handler = (url: string, init?: RequestInit) => unknown
function mockApi(looks: Handler) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    if (url.startsWith('/api/regions')) return json(REGIONS)
    if (url.startsWith('/api/geo/guess')) return json({ country_code: 'IN', source: 'timezone' })
    if (url.startsWith('/api/auth/me')) return json({ username: 'TestUser', display_name: 'Jury demo', is_demo: true })
    if (url === '/api/sessions/s1') return json(SESSION)
    if (url.includes('/looks')) {
      calls.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
      const out = looks(url, init)
      if (out instanceof Response) return out
      return json(out)
    }
    return json({}, 404)
  })
  return calls
}

function renderStudio() {
  return render(
    <StrictMode>
      <RegionProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/studio/s1']}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </RegionProvider>
    </StrictMode>,
  )
}

describe('look studio', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks which looks to build when the role has no default, then POSTs the choice', async () => {
    const menLooks = payload([1, 2, 3].map((s) => look(s as 1 | 2 | 3, ['rendering', 'pending'], { layers: ['outfit', 'hair'] })), { wear: 'men', rendering: true })
    const calls = mockApi((_url, init) => (init?.method === 'POST' ? menLooks : payload([], { wear: null })))
    renderStudio()
    expect(await screen.findByRole('heading', { name: 'Which looks should we build?' })).toBeTruthy()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0) // never auto-starts without a wear
    fireEvent.click(screen.getByRole('button', { name: /Men's wear/ }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ wear: 'men' }))
    expect((await screen.findAllByText('0 of 2 layers')).length).toBe(3)
    expect(screen.queryByRole('heading', { name: 'Which looks should we build?' })).toBeNull()
  })

  it('auto-starts once, polls, and shows each layer as it finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let polls = 0
    const calls = mockApi((_url, init) => {
      if (init?.method === 'POST') return payload([1, 2, 3].map((s) => look(s as 1 | 2 | 3, ['rendering'])), { rendering: true })
      polls += 1
      if (polls === 1) return payload([]) // round 0 → auto-start
      return payload([look(1, ['done', 'rendering']), look(2, ['rendering']), look(3, ['rendering'])], { rendering: true })
    })
    renderStudio()
    expect((await screen.findAllByText('0 of 5 layers')).length).toBe(3)
    expect(screen.getByText(/rendered live by YouCam on your own photo/)).toBeTruthy()
    expect(calls.filter((c) => c.method === 'POST')).toEqual([{ url: '/api/sessions/s1/looks', method: 'POST', body: {} }])

    await act(() => vi.advanceTimersByTimeAsync(3100))
    expect(await screen.findByText('1 of 5 layers')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Sindoor Dusk on your photo, 1 of 5 layers' }).getAttribute('src')).toBe('/api/looks/L1/image?layer=0&v=1')
    expect(screen.getByText('Outfit added')).toBeTruthy() // toast on the card
    expect(screen.getByText('Look 1: outfit added')).toBeTruthy() // polite live region
    expect(screen.getAllByText('Red Banarasi saree')[0]).toBeTruthy()
    expect(screen.getAllByText(/₹52,000/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'AI-generated product image: Kundan choker' }).length).toBe(3)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
    // Rebuild waits for rendering to finish.
    expect(screen.getByRole('button', { name: 'Build three new looks' })).toHaveProperty('disabled', true)
  })

  it('explains a failed layer and retries it', async () => {
    const failed = payload([
      look(1, ['done', 'done', 'done', 'done', 'failed'], { errors: [null, null, null, null, 'no_face'] }),
      look(2, ['done', 'done', 'done', 'done', 'done'], { total: '120000', over: true }),
      look(3, ['done', 'failed', 'done', 'done', 'done'], { errors: [null, 'error_editing_failed'] }),
    ])
    const calls = mockApi((url) =>
      url.endsWith('/retry') ? payload([look(1, ['done', 'done', 'done', 'done', 'rendering']), failed.looks[1], failed.looks[2]], { rendering: true }) : failed,
    )
    renderStudio()
    expect(await screen.findByText('4 of 5 layers rendered — retry hair')).toBeTruthy()
    expect(screen.getByText(/We couldn't find your face clearly for this layer/)).toBeTruthy()
    expect(screen.getByText("YouCam couldn't render this layer (code: error_editing_failed)")).toBeTruthy()
    expect(screen.getByText('₹1,20,000 · over budget')).toBeTruthy()
    expect(screen.getAllByText(/within your ₹75,000 budget/).length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Try again: Sindoor Dusk' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/looks/L1/retry')).toBe(true))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again: Sindoor Dusk' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Try again: Ivory Moon' })).toBeTruthy()
  })

  it('opens a look in a dialog and steps through its layers', async () => {
    const calls = mockApi((_url, init) =>
      init?.method === 'POST' ? payload([1, 2, 3].map((s) => look(s as 1 | 2 | 3, [])), { round: 2, rounds_left: 1, rendering: true }) : payload([1, 2, 3].map((s) => look(s as 1 | 2 | 3, ['done', 'done', 'done', 'done', 'done']))),
    )
    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: 'Open Sindoor Dusk layer by layer' }))
    const dialog = screen.getByRole('dialog', { name: 'Sindoor Dusk' })
    const d = within(dialog)
    expect(d.getByText('Step 6 of 6')).toBeTruthy()
    expect(d.getByRole('img', { name: 'Sindoor Dusk look, After hair' }).getAttribute('src')).toBe('/api/looks/L1/image?layer=4&v=1')
    expect(d.getAllByText('AI-generated product image').length).toBe(3)
    expect(d.getByRole('button', { name: 'Next layer' })).toHaveProperty('disabled', true)

    fireEvent.click(d.getByRole('button', { name: 'Previous layer' }))
    expect(d.getByText('Step 5 of 6')).toBeTruthy()
    expect(d.getByRole('img', { name: 'Sindoor Dusk look, After makeup' })).toBeTruthy()
    fireEvent.click(d.getByRole('button', { name: 'Your photo' }))
    expect(d.getByRole('img', { name: 'Sindoor Dusk look, Your photo' }).getAttribute('src')).toBe(FULL.url)
    expect(d.getByRole('button', { name: 'Previous layer' })).toHaveProperty('disabled', true)
    fireEvent.click(d.getByRole('button', { name: 'Next layer' }))
    expect(d.getByText('After outfit', { selector: 'p' })).toBeTruthy()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Marigold Morning layer by layer' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Rebuild: confirm step, then POST replan.
    expect(screen.getByText('2 rebuilds left')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Build three new looks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, build new looks' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ replan: true }))
    expect(await screen.findByText(/1 rebuild left/)).toBeTruthy()
  })

  it('shows a friendly message when the catalogue is not ready', async () => {
    mockApi((_url, init) => (init?.method === 'POST' ? new Response('{"detail":"catalogue_empty"}', { status: 503 }) : payload([])))
    renderStudio()
    expect(await screen.findByText('Our catalogue is still being prepared. Please try again in a minute.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
