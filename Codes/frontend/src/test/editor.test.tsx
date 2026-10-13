import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import i18n from '../i18n'
import type { LayerName, LayerOptions, LayerStatus, Look, LooksPayload } from '../lib/api'
import { AuthProvider } from '../lib/auth'
import { RegionProvider } from '../lib/region'

const REGIONS = {
  countries: [{ code: 'IN', currency: 'INR', locales: ['en', 'hi', 'bn'], timezones: ['Asia/Kolkata'], events: ['wedding'], budget_presets: [75000], cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }] }],
  events: {},
}
const SESSION = {
  id: 's1', country_code: 'IN', city: 'Kolkata', role: 'bride', event_type: 'wedding', event_date: '2027-02-14', budget_amount: '75000',
  currency: 'INR', style_tags: ['traditional'], delete_after: null,
  photos: [{ kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=1', quality: null }],
}
const WOMEN: LayerName[] = ['outfit', 'necklace', 'earrings', 'makeup', 'hair']
const ITEMS: Partial<Record<LayerName, [string, string]>> = {
  outfit: ['Red Banarasi saree', '52000'],
  necklace: ['Kundan choker', '15999'],
  earrings: ['Jhumka pair', '7000'],
}

function look(slot: 1 | 2 | 3, statuses: LayerStatus[], total = '74999'): Look {
  const id = `L${slot}`
  const layers = WOMEN.map((layer, i) => {
    const s = statuses[i] ?? 'done'
    const meta = ITEMS[layer]
    return {
      layer,
      status: s,
      error: null,
      units: 0,
      render_url: s === 'done' ? `/api/looks/${id}/image?layer=${i}&v=1` : null,
      item: meta ? { id: `${layer}-${slot}`, sku: `SKU-${layer}`, name: meta[0], price: meta[1], image_url: `/api/catalogue/${layer}-${slot}/image`, metal: null, licence: 'ai' } : null,
      params: layer === 'hair' ? { template_id: 'sleek' } : null,
    }
  })
  const done = layers.filter((l) => l.status === 'done')
  return {
    id, slot, preset: (['sindoor_dusk', 'marigold_morning', 'ivory_moon'] as const)[slot - 1], status: 'draft',
    total_price: total, currency: 'INR', over_budget: false,
    image_url: done.length ? done[done.length - 1].render_url : null,
    layers_done: done.length, layers_total: layers.filter((l) => l.status !== 'off').length, layers,
  }
}

const ALL_DONE: LayerStatus[] = ['done', 'done', 'done', 'done', 'done']
function payload(looks: Look[], extra: Partial<LooksPayload> = {}): LooksPayload {
  return { wear: 'women', round: 1, rounds_left: 2, rendering: false, edits_left: 12, looks, ...extra }
}
const finished = () => payload([look(1, ALL_DONE), look(2, ALL_DONE), look(3, ALL_DONE)])

function options(layer: LayerName): LayerOptions {
  const after = WOMEN.slice(WOMEN.indexOf(layer))
  const base = { layer, enabled: true, removable: layer !== 'outfit', units_to_rerender: after.length + 1, layers_affected: after, edits_left: 12 }
  if (layer === 'necklace') {
    const item = (id: string, name: string, price: string, event_match: boolean, current: boolean) => ({
      id, sku: id, name, price, currency: 'INR', image_url: `/api/catalogue/${id}/image`, metal: 'gold', weight_class: 'heavy', colour_family: 'gold',
      licence: 'AI-generated', event_match, current,
    })
    return {
      ...base,
      items: [item('necklace-1', 'Kundan choker', '15999', true, true), item('pearls', 'Moti pearls', '7799', true, false), item('temple', 'Temple gold necklace', '21999', false, false)],
    }
  }
  if (layer === 'makeup') {
    return {
      ...base,
      makeup: {
        presets: [
          { key: 'sindoor_dusk', lip: '#9E1B32', blush: '#C25A5A', shadow: '#6B3A2E', current: true },
          { key: 'marigold_morning', lip: '#D9654B', blush: '#E8916F', shadow: '#C98A3A', current: false },
          { key: 'ivory_moon', lip: '#B5656B', blush: '#D79A9A', shadow: '#8E6B5C', current: false },
        ],
        lip_shades: [
          { key: 'classic_red', hex: '#B0122B' }, { key: 'coral', hex: '#D9654B' }, { key: 'plum', hex: '#6E2A4A' }, { key: 'rose_nude', hex: '#B5656B' },
        ],
        current_preset: 'sindoor_dusk',
        current_lip: '#9E1B32',
      },
    }
  }
  if (layer === 'hair') {
    return {
      ...base,
      hair: [
        { template_id: 'sleek', title: 'Sleek Middle Part', thumb: 'https://cdn.example/sleek.jpg', current: true },
        { template_id: 'bob', title: 'Blunt Bob', thumb: 'https://cdn.example/bob.jpg', current: false },
      ],
    }
  }
  return base
}

type Call = { url: string; method: string; body: unknown }
type Patcher = (url: string, body: Record<string, unknown>) => Response | LooksPayload

function mockApi(opts: { looks?: () => LooksPayload; patch?: Patcher } = {}) {
  const calls: Call[] = []
  const looksNow = opts.looks ?? finished
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    if (url.startsWith('/api/regions')) return json(REGIONS)
    if (url.startsWith('/api/geo/guess')) return json({ country_code: 'IN', source: 'timezone' })
    if (url.startsWith('/api/auth/me')) return json({ username: 'TestUser', display_name: 'Jury demo', is_demo: true })
    if (url === '/api/sessions/s1') return json(SESSION)
    if (url.includes('/looks')) {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
      calls.push({ url, method, body })
      const opt = url.match(/\/options\/(\w+)$/)
      if (opt) return json(options(opt[1] as LayerName))
      if (method === 'PATCH') {
        const out = opts.patch ? opts.patch(url, body ?? {}) : rerendering(url)
        return out instanceof Response ? out : json(out)
      }
      return json(looksNow())
    }
    return json({}, 404)
  })
  return calls
}

/** Server reply to a PATCH: the edited layer and every later one go back to pending. */
function rerendering(url: string): LooksPayload {
  const layer = url.split('/').pop() as LayerName
  const from = WOMEN.indexOf(layer)
  const statuses = WOMEN.map((_, i) => (i < from ? 'done' : 'pending')) as LayerStatus[]
  return payload([look(1, statuses), look(2, ALL_DONE), look(3, ALL_DONE)], { rendering: true, edits_left: 11 })
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

async function openEditor(layer: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Change ${layer} for Look 1` }))
  const dialog = screen.getByRole('dialog', { name: `Change ${layer} · Look 1 Sindoor Dusk` })
  const d = within(dialog)
  await d.findAllByRole('radio')
  return { dialog, d }
}

const patches = (calls: Call[]) => calls.filter((c) => c.method === 'PATCH')

describe('look studio editor', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows Change on every layer, plus the edit hint', async () => {
    mockApi()
    renderStudio()
    for (const layer of ['outfit', 'necklace', 'earrings', 'makeup', 'hair']) {
      expect(await screen.findByRole('button', { name: `Change ${layer} for Look 1` })).toHaveProperty('disabled', false)
    }
    expect(screen.getAllByRole('button', { name: /^Change .+ for Look \d$/ })).toHaveLength(15)
    expect(screen.getByText('Tap Change on any layer to swap pieces, makeup or hair.')).toBeTruthy()
  })

  it('disables Change while the look is rendering', async () => {
    mockApi({ looks: () => payload([look(1, ['done', 'rendering', 'pending', 'pending', 'pending']), look(2, ALL_DONE), look(3, ALL_DONE)], { rendering: true }) })
    renderStudio()
    const btn = await screen.findByRole('button', { name: 'Change necklace for Look 1' })
    expect(btn).toHaveProperty('disabled', true)
    expect(screen.getByText('You can edit this look once it finishes rendering.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change necklace for Look 2' })).toHaveProperty('disabled', false)
  })

  it('swaps a necklace: price impact, PATCH {item_id}, toast, polling restarts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const calls = mockApi()
    renderStudio()
    const { dialog, d } = await openEditor('necklace')
    expect(calls.some((c) => c.url === '/api/looks/L1/options/necklace')).toBe(true)
    expect(d.getByRole('radio', { name: /Kundan choker/ })).toHaveProperty('checked', true)
    expect(d.getAllByText('AI-generated product image').length).toBe(3)
    expect(d.getAllByText('Current').length).toBeGreaterThan(0)
    const apply = d.getByRole('button', { name: 'Apply & re-render' })
    expect(apply).toHaveProperty('disabled', true)

    // Filter + sort chips.
    fireEvent.click(d.getByRole('button', { name: 'Suits your event' }))
    expect(d.queryByRole('radio', { name: /Temple gold necklace/ })).toBeNull()
    fireEvent.click(d.getByRole('button', { name: 'Suits your event' }))
    fireEvent.click(d.getByRole('button', { name: 'Price: low to high' }))
    expect(d.getAllByRole('radio').map((r) => r.getAttribute('aria-label')?.split(' · ')[0])).toEqual(['Moti pearls', 'Kundan choker', 'Temple gold necklace'])

    fireEvent.click(d.getByRole('radio', { name: /Moti pearls/ }))
    expect(d.getByText(/₹15,999 → ₹7,799/)).toBeTruthy()
    expect(d.getByText(/total ₹66,799 of ₹75,000/)).toBeTruthy()
    expect(d.getByText(/^Re-renders necklace, earrings, makeup,? and hair · about 5 YouCam units · ~2 min$/)).toBeTruthy()
    expect(d.getByText(/12 edits left/)).toBeTruthy()

    const looksGets = () => calls.filter((c) => c.method === 'GET' && c.url === '/api/sessions/s1/looks').length
    fireEvent.click(apply)
    await waitFor(() => expect(patches(calls)).toEqual([{ url: '/api/looks/L1/layers/necklace', method: 'PATCH', body: { item_id: 'pearls' } }]))
    await waitFor(() => expect(dialog.isConnected).toBe(false))
    expect(await screen.findByText('Necklace changed — re-rendering')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change necklace for Look 1' })).toHaveProperty('disabled', true)

    // The PATCH response has pending layers → polling resumes.
    const before = looksGets()
    await act(() => vi.advanceTimersByTimeAsync(3100))
    expect(looksGets()).toBeGreaterThan(before)
  })

  it('makeup: picking a mood resets the lip, then a shade overrides it → PATCH {preset, lip}', async () => {
    const calls = mockApi()
    renderStudio()
    const { d } = await openEditor('makeup')
    expect(d.getByRole('radio', { name: 'Sindoor Dusk · Current' })).toHaveProperty('checked', true)
    fireEvent.click(d.getByRole('radio', { name: 'Marigold Morning' }))
    expect(d.getByRole('radio', { name: 'Coral' })).toHaveProperty('checked', true) // the mood's own lip
    fireEvent.click(d.getByRole('radio', { name: 'Plum' }))
    expect(d.getByRole('radio', { name: 'Coral' })).toHaveProperty('checked', false)
    fireEvent.click(d.getByRole('button', { name: 'Apply & re-render' }))
    await waitFor(() => expect(patches(calls)[0]?.body).toEqual({ preset: 'marigold_morning', lip: '#6E2A4A' }))
    expect(await screen.findByText('Makeup changed — re-rendering')).toBeTruthy()
  })

  it('makeup: lipstick only → PATCH {lip}', async () => {
    const calls = mockApi()
    renderStudio()
    const { d } = await openEditor('makeup')
    fireEvent.click(d.getByRole('radio', { name: 'Classic red' }))
    fireEvent.click(d.getByRole('button', { name: 'Apply & re-render' }))
    await waitFor(() => expect(patches(calls)[0]?.body).toEqual({ lip: '#B0122B' }))
  })

  it('hair → PATCH {template_id}', async () => {
    const calls = mockApi()
    renderStudio()
    const { d } = await openEditor('hair')
    expect(d.getByRole('radio', { name: 'Sleek Middle Part · Current' })).toHaveProperty('checked', true)
    fireEvent.click(d.getByRole('radio', { name: 'Blunt Bob' }))
    fireEvent.click(d.getByRole('button', { name: 'Apply & re-render' }))
    await waitFor(() => expect(patches(calls)[0]).toEqual({ url: '/api/looks/L1/layers/hair', method: 'PATCH', body: { template_id: 'bob' } }))
  })

  it('remove → PATCH {enabled:false}; the row then offers Add back → PATCH {enabled:true}', async () => {
    let necklaceOff = false
    const withOff = () => {
      const l1 = look(1, ['done', 'off', 'done', 'done', 'done'], '58999')
      return payload([l1, look(2, ALL_DONE), look(3, ALL_DONE)])
    }
    const calls = mockApi({
      looks: () => (necklaceOff ? withOff() : finished()),
      patch: (url, body) => {
        if (body.enabled === false) {
          necklaceOff = true
          return withOff()
        }
        necklaceOff = false
        return rerendering(url)
      },
    })
    renderStudio()
    const { d } = await openEditor('necklace')
    const remove = d.getByRole('button', { name: /Remove necklace/ })
    fireEvent.click(remove)
    expect(remove.getAttribute('aria-pressed')).toBe('true')
    expect(d.getByText(/₹15,999 → removed/)).toBeTruthy()
    fireEvent.click(d.getByRole('button', { name: 'Apply & re-render' }))
    await waitFor(() => expect(patches(calls)[0]?.body).toEqual({ enabled: false }))
    expect(await screen.findByText('Necklace removed — updating the look')).toBeTruthy()

    const list = screen.getByRole('list', { name: 'Sindoor Dusk layers' })
    expect(within(list).getByText('Removed')).toBeTruthy()
    expect(within(list).queryByRole('button', { name: 'Change necklace for Look 1' })).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: 'Add necklace back to Look 1' }))
    await waitFor(() => expect(patches(calls)[1]).toEqual({ url: '/api/looks/L1/layers/necklace', method: 'PATCH', body: { enabled: true } }))
    expect(await screen.findByText('Necklace added back — re-rendering')).toBeTruthy()
  })

  it('look_busy (409) keeps the sheet open with a clear message', async () => {
    const calls = mockApi({ patch: () => new Response('{"detail":"look_busy"}', { status: 409 }) })
    renderStudio()
    const { dialog, d } = await openEditor('necklace')
    fireEvent.click(d.getByRole('radio', { name: /Temple gold necklace/ }))
    fireEvent.click(d.getByRole('button', { name: 'Apply & re-render' }))
    expect((await d.findByRole('alert')).textContent).toContain("This look is still rendering — try again when it's finished.")
    expect(patches(calls)).toHaveLength(1)
    expect(dialog.isConnected).toBe(true)
    fireEvent.click(d.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('edit_limit (429) says the edits are used up', async () => {
    mockApi({ patch: () => new Response('{"detail":"edit_limit"}', { status: 429 }) })
    renderStudio()
    const { d } = await openEditor('hair')
    fireEvent.click(d.getByRole('radio', { name: 'Blunt Bob' }))
    fireEvent.click(d.getByRole('button', { name: 'Apply & re-render' }))
    expect((await d.findByRole('alert')).textContent).toContain("You've used all edits for this session.")
  })

  it('closes with Escape and the close button', async () => {
    mockApi()
    renderStudio()
    const { dialog } = await openEditor('hair')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Change hair for Look 1' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
