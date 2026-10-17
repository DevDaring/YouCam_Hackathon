import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import i18n from '../i18n'
import type { LayerName, Look, LooksPayload } from '../lib/api'
import { AuthProvider } from '../lib/auth'
import { RegionProvider } from '../lib/region'
import { shareLinks } from '../lib/share'

const REGIONS = {
  countries: [{ code: 'IN', currency: 'INR', locales: ['en', 'hi', 'bn'], timezones: ['Asia/Kolkata'], events: ['wedding'], budget_presets: [75000], cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }] }],
  events: {},
}
const FULL = { kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=1', quality: null }
const SESSION = {
  id: 's1', country_code: 'IN', city: 'Kolkata', role: 'bride', event_type: 'wedding', event_date: '2027-02-14', budget_amount: '75000',
  currency: 'INR', style_tags: ['traditional'], delete_after: '2027-01-01T10:00:00Z', photos: [FULL],
}
const WOMEN: LayerName[] = ['outfit', 'necklace', 'earrings', 'makeup', 'hair']
const SHARE = {
  url: 'https://dearyou.koushikdeb.com/s/tok123',
  image_url: '/api/share/tok123/image',
  title: 'Look 1 · Sindoor Dusk',
  text: 'Help me choose! Here is my Sindoor Dusk look for my Wedding & reception',
  expires_at: '2027-01-01T10:00:00Z',
}
const URL_ENC = encodeURIComponent(SHARE.url)
const TEXT_URL = encodeURIComponent(`${SHARE.text} ${SHARE.url}`)

function look(slot: 1 | 2 | 3, rendered = true): Look {
  const id = `L${slot}`
  const layers = WOMEN.map((layer, i) => ({
    layer, status: rendered ? ('done' as const) : ('pending' as const), error: null, units: 0,
    render_url: rendered ? `/api/looks/${id}/image?layer=${i}&v=1` : null, item: null, params: null,
  }))
  return {
    id, slot, preset: (['sindoor_dusk', 'marigold_morning', 'ivory_moon'] as const)[slot - 1], status: 'draft',
    total_price: '74999', currency: 'INR', over_budget: false, image_url: rendered ? `/api/looks/${id}/image?layer=4&v=1` : null,
    layers_done: rendered ? 5 : 0, layers_total: 5, layers, enhance_status: null, enhance_error: null, enhanced_by: null, enhanced_url: null,
  }
}
const PAYLOAD: LooksPayload = { wear: 'women', round: 1, rounds_left: 2, rendering: false, edits_left: 10, looks: [look(1), look(2), look(3, false)] }

type Call = { url: string; method: string }
function mockApi(share: (lookId: string) => Response | object = () => SHARE) {
  const calls: Call[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    if (url.startsWith('/api/regions')) return json(REGIONS)
    if (url.startsWith('/api/geo/guess')) return json({ country_code: 'IN', source: 'timezone' })
    if (url.startsWith('/api/auth/me')) return json({ username: 'TestUser', display_name: 'Jury demo', is_demo: true })
    calls.push({ url, method })
    if (url === '/api/sessions/s1') return json(SESSION)
    if (url === '/api/sessions/s1/looks') return json(PAYLOAD)
    const m = url.match(/^\/api\/looks\/(L\d)\/share$/)
    if (m && method === 'POST') {
      const out = share(m[1])
      return out instanceof Response ? out : json(out)
    }
    if (url === SHARE.image_url) return new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), { status: 200 })
    return json({}, 404)
  })
  return calls
}

function renderStudio() {
  return render(
    <RegionProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/studio/s1']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </RegionProvider>,
  )
}

async function openSheet() {
  fireEvent.click(await screen.findByRole('button', { name: 'Share Sindoor Dusk' }))
  const dialog = await screen.findByRole('dialog', { name: 'Share Sindoor Dusk' })
  const d = within(dialog)
  await d.findByText('WhatsApp')
  return { dialog, d }
}

function setNavigator(key: string, value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

describe('share a look', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    for (const k of ['share', 'canShare', 'clipboard']) Reflect.deleteProperty(navigator, k)
  })

  it('only looks with a rendered layer get a Share button; tapping it POSTs /share and opens the sheet', async () => {
    const calls = mockApi()
    renderStudio()
    expect(await screen.findByRole('button', { name: 'Share Sindoor Dusk' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share Marigold Morning' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Share Ivory Moon' })).toBeNull()

    const { d } = await openSheet()
    expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/looks/L1/share')).toHaveLength(1)
    expect(d.getByRole('heading', { level: 2, name: 'Share Sindoor Dusk' })).toBeTruthy()
    expect((d.getByRole('img', { name: 'Sindoor Dusk look, ready to share' }) as HTMLImageElement).getAttribute('src')).toBe(SHARE.image_url)
    expect(d.getByText('Look 1 · Sindoor Dusk')).toBeTruthy()
    expect(d.getByText(SHARE.text)).toBeTruthy()
    expect(d.getByText(/Anyone with the link can see this look image until your photos are deleted on .*2027/)).toBeTruthy()
    // No Web Share API in this browser → no "Share…" button; desktop → no SMS.
    expect(d.queryByRole('button', { name: 'Share…' })).toBeNull()
    expect(d.queryByText('Text message')).toBeNull()
  })

  it('platform links are correctly encoded and open in a new tab', async () => {
    mockApi()
    renderStudio()
    const { dialog } = await openSheet()
    const href = (k: string) => dialog.querySelector(`[data-platform="${k}"]`)!.getAttribute('href')
    expect(href('whatsapp')).toBe(`https://wa.me/?text=${TEXT_URL}`)
    expect(href('whatsapp')).toContain('%20https%3A%2F%2Fdearyou.koushikdeb.com%2Fs%2Ftok123')
    expect(href('whatsapp')).toContain('%26%20reception') // "&" in the text is escaped
    expect(href('facebook')).toBe(`https://www.facebook.com/sharer/sharer.php?u=${URL_ENC}`)
    expect(href('x')).toBe(`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE.text)}&url=${URL_ENC}`)
    expect(href('telegram')).toBe(`https://t.me/share/url?url=${URL_ENC}&text=${encodeURIComponent(SHARE.text)}`)
    expect(href('pinterest')).toBe(
      `https://pinterest.com/pin/create/button/?url=${URL_ENC}&media=${encodeURIComponent('https://dearyou.koushikdeb.com/api/share/tok123/image')}&description=${encodeURIComponent(SHARE.text)}`,
    )
    expect(href('linkedin')).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=${URL_ENC}`)
    expect(href('reddit')).toBe(`https://www.reddit.com/submit?url=${URL_ENC}&title=${encodeURIComponent('Look 1 · Sindoor Dusk')}`)
    expect(href('email')).toBe(`mailto:?subject=${encodeURIComponent('Look 1 · Sindoor Dusk')}&body=${TEXT_URL}`)
    const wa = dialog.querySelector('[data-platform="whatsapp"]')!
    expect(wa.getAttribute('target')).toBe('_blank')
    expect(wa.getAttribute('rel')).toBe('noopener noreferrer')
    expect(dialog.querySelector('[data-platform="email"]')!.hasAttribute('target')).toBe(false)
  })

  it('shareLinks adds SMS on phones and encodes emoji', () => {
    const links = shareLinks({ url: 'https://x.test/s/a b', text: 'Haan 💛?', title: 'T&C', imageUrl: 'https://x.test/i.jpg' }, true)
    expect(links.map((l) => l.key)).toEqual(['whatsapp', 'facebook', 'x', 'telegram', 'pinterest', 'linkedin', 'reddit', 'email', 'sms'])
    expect(links.find((l) => l.key === 'sms')!.href).toBe(`sms:?&body=${encodeURIComponent('Haan 💛? https://x.test/s/a b')}`)
    expect(links.find((l) => l.key === 'whatsapp')!.href).toBe('https://wa.me/?text=Haan%20%F0%9F%92%9B%3F%20https%3A%2F%2Fx.test%2Fs%2Fa%20b')
    expect(links.find((l) => l.key === 'reddit')!.href).toContain('&title=T%26C')
  })

  it('falls back to the translated default text when the API sends none', async () => {
    mockApi(() => ({ ...SHARE, text: '' }))
    renderStudio()
    const { d } = await openSheet()
    expect(d.getByText("Help me choose! Here's my Sindoor Dusk look for my Wedding — tell me Haan, Hmm or Na 💛")).toBeTruthy()
  })

  it('Web Share: sends the JPEG file when files can be shared', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {})
    const canShare = vi.fn(() => true)
    setNavigator('share', share)
    setNavigator('canShare', canShare)
    mockApi()
    renderStudio()
    const { d } = await openSheet()
    // Wait for the image prefetch, then share.
    await waitFor(() => {
      fireEvent.click(d.getByRole('button', { name: 'Share…' }))
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: expect.any(Array) }))
    })
    const data = share.mock.calls[share.mock.calls.length - 1][0]
    expect(data.url).toBe(SHARE.url)
    expect(data.text).toBe(SHARE.text)
    const file = data.files![0]
    expect(file.name).toBe('dearyou-look.jpg')
    expect(file.type).toBe('image/jpeg')
  })

  it('Web Share without file support shares the link; AbortError (cancel) shows no error', async () => {
    const share = vi.fn(async () => {
      throw Object.assign(new Error('cancelled'), { name: 'AbortError' })
    })
    setNavigator('share', share)
    setNavigator('canShare', () => false)
    mockApi()
    renderStudio()
    const { d } = await openSheet()
    fireEvent.click(d.getByRole('button', { name: 'Share…' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Look 1 · Sindoor Dusk', text: SHARE.text, url: SHARE.url }))
    await new Promise((r) => setTimeout(r, 10))
    expect(d.queryByText("The share menu didn't open. Use one of the buttons below instead.")).toBeNull()

    share.mockImplementationOnce(async () => {
      throw Object.assign(new Error('nope'), { name: 'NotAllowedError' })
    })
    fireEvent.click(d.getByRole('button', { name: 'Share…' }))
    expect(await d.findByText("The share menu didn't open. Use one of the buttons below instead.")).toBeTruthy()
  })

  it('copy link shows "Copied ✓"; download is an <a download> of the image', async () => {
    const writeText = vi.fn(async () => {})
    setNavigator('clipboard', { writeText })
    mockApi()
    renderStudio()
    const { d } = await openSheet()
    expect((d.getByLabelText('Share link') as HTMLInputElement).value).toBe(SHARE.url)
    fireEvent.click(d.getByRole('button', { name: 'Copy link' }))
    expect(await d.findByRole('button', { name: 'Copied ✓' })).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(SHARE.url)

    const dl = d.getByRole('link', { name: 'Download image' })
    expect(dl.getAttribute('href')).toBe(SHARE.image_url)
    expect(dl.getAttribute('download')).toBe('dearyou-look-1.jpg')
  })

  it('Instagram on desktop downloads the picture and explains how to post it', async () => {
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    mockApi()
    renderStudio()
    const { d } = await openSheet()
    fireEvent.click(d.getByRole('button', { name: 'Instagram' }))
    expect(await d.findByText('Image saved — open Instagram and post it from your gallery.')).toBeTruthy()
    expect(clicked).toHaveLength(1)
    expect(clicked[0].getAttribute('href')).toBe(SHARE.image_url)
    expect(clicked[0].download).toBe('dearyou-look-1.jpg')
  })

  it('409 nothing_to_share shows a friendly message', async () => {
    mockApi(() => new Response(JSON.stringify({ detail: 'nothing_to_share' }), { status: 409 }))
    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: 'Share Sindoor Dusk' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share Sindoor Dusk' })
    expect(await within(dialog).findByText('This look has no finished picture yet. Share it once a layer is ready.')).toBeTruthy()
  })

  it('the lightbox has a Share button that opens the same sheet', async () => {
    const calls = mockApi()
    renderStudio()
    fireEvent.click(await screen.findByRole('button', { name: 'Open Marigold Morning layer by layer' }))
    const lightbox = await screen.findByRole('dialog', { name: 'Marigold Morning' })
    fireEvent.click(within(lightbox).getByRole('button', { name: 'Share Marigold Morning' }))
    expect(await screen.findByRole('dialog', { name: 'Share Marigold Morning' })).toBeTruthy()
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/looks/L2/share')).toBe(true))
  })
})
