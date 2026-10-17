import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import i18n from '../i18n'
import type { PhotoInfo } from '../lib/api'
import { AuthProvider } from '../lib/auth'
import { RegionProvider } from '../lib/region'

const REGIONS = {
  countries: [{ code: 'IN', currency: 'INR', locales: ['en', 'hi', 'bn'], timezones: ['Asia/Kolkata'], events: ['wedding'], budget_presets: [75000], cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }] }],
  events: {},
}
const SESSION = {
  id: 's1', country_code: 'IN', city: 'Kolkata', role: 'bride', event_type: 'wedding', event_date: '2027-02-14', budget_amount: '75000',
  currency: 'INR', style_tags: ['traditional'], delete_after: null,
}
const QUALITY = { ok: true, checks: [{ key: 'light', status: 'pass', value: 200 }, { key: 'face', status: 'warn', value: 2 }] }
const PEOPLE = [0, 1].map((index) => ({ index, x: 100 + index * 800, y: 100, w: 110, h: 140, score: 0.95, thumb_url: `/api/sessions/s1/photos/full/people/${index}?v=a` }))

function fullPhoto(extra: Partial<PhotoInfo> = {}): PhotoInfo {
  return { kind: 'full', width: 1600, height: 1500, url: '/api/sessions/s1/photos/full?v=a', quality: QUALITY as PhotoInfo['quality'], people: PEOPLE, target: null, target_source: null, ...extra }
}
const SOLO: PhotoInfo = { kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=b', quality: { ok: true, checks: [{ key: 'face', status: 'pass', value: 1 }] }, people: [], target: null, target_source: null }
const FACE: PhotoInfo = { kind: 'face', width: 600, height: 600, url: '/api/sessions/s1/photos/face?v=c', quality: { ok: true, checks: [{ key: 'face', status: 'pass', value: 1 }] }, people: [], target: null, target_source: null }

interface Opts {
  /** Photos the session starts with. */
  photos?: PhotoInfo[]
  /** What POST /photos returns for each kind. */
  upload?: Partial<Record<'full' | 'face', PhotoInfo>>
  /** The full photo the server holds after a face close-up upload (the auto-match result). */
  afterFace?: PhotoInfo
  targetStatus?: number
  looks?: (method: string, calls: number) => Response | unknown
}

function mockApi(opts: Opts) {
  const calls: { url: string; method: string; body: unknown }[] = []
  let photos = [...(opts.photos ?? [])]
  let looksCalls = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    if (url.startsWith('/api/regions')) return json(REGIONS)
    if (url.startsWith('/api/geo/guess')) return json({ country_code: 'IN', source: 'timezone' })
    if (url.startsWith('/api/auth/me')) return json({ username: 'TestUser', display_name: 'Jury demo', is_demo: true })
    if (url.startsWith('/api/sessions/s1') || url.startsWith('/api/looks')) calls.push({ url, method, body })
    if (url === '/api/sessions/s1') return json({ ...SESSION, photos })
    if (url === '/api/sessions/s1/photos' && method === 'POST') {
      const kind = (init?.body as FormData).get('kind') as 'full' | 'face'
      const info = opts.upload?.[kind] ?? (kind === 'full' ? fullPhoto() : FACE)
      photos = [...photos.filter((p) => p.kind !== kind), info]
      if (kind === 'face' && opts.afterFace) photos = [...photos.filter((p) => p.kind !== 'full'), opts.afterFace]
      return json(info)
    }
    if (url === '/api/sessions/s1/photos/full/target' && method === 'POST') {
      if (opts.targetStatus) return json({ detail: 'invalid_person' }, opts.targetStatus)
      const full = { ...(photos.find((p) => p.kind === 'full') ?? fullPhoto()), target: body.index, target_source: 'user' as const }
      photos = [...photos.filter((p) => p.kind !== 'full'), full]
      return json(full)
    }
    if (url === '/api/sessions/s1/looks' && opts.looks) {
      if (method === 'POST') looksCalls += 1
      const out = opts.looks(method, looksCalls)
      return out instanceof Response ? out : json(out)
    }
    return json({}, 404)
  })
  return calls
}

function renderAt(path: string) {
  return render(
    <RegionProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </RegionProvider>,
  )
}

const pick = (file = 'me.jpg') => {
  const input = document.querySelector('input[data-testid=photo-upload-input]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], file, { type: 'image/jpeg' })] } })
}
const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement
const targetPosts = (calls: { url: string; method: string; body: unknown }[]) => calls.filter((c) => c.url.endsWith('/photos/full/target'))

describe('who should we dress? (photo step)', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('shows no picker for a photo of one person', async () => {
    mockApi({ upload: { full: SOLO } })
    renderAt('/photo/s1')
    await screen.findByRole('heading', { level: 1, name: 'Your full-length photo' })
    pick()
    expect(await screen.findByText('Face found')).toBeTruthy()
    expect(screen.queryByTestId('person-picker')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('asks who to dress for a group photo, with a tip, and POSTs the tapped person', async () => {
    const calls = mockApi({})
    renderAt('/photo/s1')
    await screen.findByRole('heading', { level: 1, name: 'Your full-length photo' })
    pick()
    const group = await screen.findByRole('radiogroup', { name: 'We found 2 people in this photo. Who should we dress?' })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByText(/Only the person you choose gets the outfit/)).toBeTruthy()
    expect(screen.getByText(/Tip: add a face close-up next/)).toBeTruthy()
    // The "only you in the photo" warning is replaced by the picker.
    expect(screen.queryByText(/More than one person found/)).toBeNull()
    expect(radio('Person 1').checked).toBe(false)

    fireEvent.click(radio('Person 2'))
    expect(radio('Person 2').checked).toBe(true) // optimistic
    await waitFor(() => expect(targetPosts(calls).map((c) => c.body)).toEqual([{ index: 1 }]))
    await waitFor(() => expect(screen.queryByText(/Tip: add a face close-up next/)).toBeNull())
    // Continuing is always allowed.
    fireEvent.click(screen.getByRole('button', { name: /Use this photo/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'A close-up of your face' })).toBeTruthy()
  })

  it('puts the choice back if saving fails', async () => {
    mockApi({ photos: [fullPhoto({ target: 0, target_source: 'match' })], targetStatus: 500 })
    renderAt('/photo/s1')
    await screen.findByRole('radiogroup')
    fireEvent.click(radio('Person 2'))
    expect(await screen.findByText("We couldn't save your choice. Please try again.")).toBeTruthy()
    expect(radio('Person 1').checked).toBe(true)
    expect(radio('Person 2').checked).toBe(false)
  })

  it('pre-selects the face matched from the close-up, with a note', async () => {
    mockApi({ photos: [fullPhoto({ target: 0, target_source: 'match' })] })
    renderAt('/photo/s1')
    await screen.findByRole('radiogroup')
    expect(radio('Person 1').checked).toBe(true)
    expect(radio('Person 2').checked).toBe(false)
    expect(screen.getByText('Matched to your face close-up ✓')).toBeTruthy()
    expect(screen.queryByText(/Tip: add a face close-up next/)).toBeNull()
  })

  it('face step: says who was matched after the close-up, and "Not you?" reopens the picker', async () => {
    const calls = mockApi({ photos: [fullPhoto()], afterFace: fullPhoto({ target: 0, target_source: 'match' }) })
    renderAt('/photo/s1')
    await screen.findByRole('radiogroup')
    fireEvent.click(screen.getByRole('button', { name: /Use this photo/ }))
    await screen.findByRole('heading', { level: 1, name: 'A close-up of your face' })
    pick('face.jpg')
    expect(await screen.findByText('We matched you in the group photo ✓')).toBeTruthy()
    const summary = screen.getByTestId('person-summary')
    expect(within(summary).getByRole('img', { name: 'Person 1' })).toBeTruthy()
    // The page re-read the session to get the full photo's match.
    expect(calls.filter((c) => c.url === '/api/sessions/s1' && c.method === 'GET').length).toBeGreaterThanOrEqual(2)

    fireEvent.click(screen.getByRole('button', { name: 'Not you? Choose' }))
    expect(await screen.findByRole('radiogroup', { name: /Who should we dress\?/ })).toBeTruthy()
    expect(radio('Person 1').checked).toBe(true)
    fireEvent.click(radio('Person 2'))
    await waitFor(() => expect(targetPosts(calls).map((c) => c.body)).toEqual([{ index: 1 }]))
    expect(radio('Person 2').checked).toBe(true)
  })

  it('face step: no confident match shows the picker right there', async () => {
    const calls = mockApi({ photos: [fullPhoto()], afterFace: fullPhoto() })
    renderAt('/photo/s1')
    await screen.findByRole('radiogroup')
    fireEvent.click(screen.getByRole('button', { name: /Use this photo/ }))
    await screen.findByRole('heading', { level: 1, name: 'A close-up of your face' })
    pick('face.jpg')
    const group = await screen.findByRole('radiogroup', { name: "We couldn't tell who you are in the group photo — tap your face" })
    fireEvent.click(within(group).getByRole('radio', { name: 'Person 1' }))
    await waitFor(() => expect(targetPosts(calls).map((c) => c.body)).toEqual([{ index: 0 }]))
    // Stays open with the tapped face selected.
    expect(radio('Person 1').checked).toBe(true)
  })
})

describe('who should we dress? (studio)', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })

  const rendering = {
    wear: 'women', round: 1, rounds_left: 2, rendering: true,
    looks: [1, 2, 3].map((slot) => ({
      id: `L${slot}`, slot, preset: 'sindoor_dusk', status: 'draft', total_price: '50000', currency: 'INR', over_budget: false, image_url: null,
      layers_done: 0, layers_total: 1, layers: [{ layer: 'outfit', status: 'rendering', error: null, units: 0, render_url: null, item: null, params: null }],
    })),
  }

  it('asks who to dress when looks need a person, then starts the looks', async () => {
    const calls = mockApi({
      photos: [fullPhoto()],
      looks: (method, n) => {
        if (method === 'GET') return { wear: 'women', round: 0, rounds_left: 3, rendering: false, looks: [] }
        return n === 1 ? new Response(JSON.stringify({ detail: 'person_required' }), { status: 422 }) : rendering
      },
    })
    renderAt('/studio/s1')
    const group = await screen.findByRole('radiogroup', { name: 'We found 2 people in this photo. Who should we dress?' })
    expect(screen.getByText('Your three looks start as soon as you choose.')).toBeTruthy()
    expect(within(screen.getByTestId('dressing')).getByText('Not chosen yet')).toBeTruthy()

    fireEvent.click(within(group).getByRole('radio', { name: 'Person 1' }))
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST').map((c) => c.url.replace('/api/sessions/s1', ''))).toEqual(['/looks', '/photos/full/target', '/looks']))
    expect(targetPosts(calls)[0].body).toEqual({ index: 0 })
    expect((await screen.findAllByText('0 of 1 layers')).length).toBe(3)
    expect(screen.queryByText('Your three looks start as soon as you choose.')).toBeNull()
    expect(within(screen.getByTestId('dressing')).getByRole('img', { name: 'Person 1' })).toBeTruthy()
  })

  it('"Change" after looks exist explains a rebuild is needed', async () => {
    const done = { ...rendering, rendering: false, looks: rendering.looks.map((l) => ({ ...l, layers_done: 1, image_url: '/x.jpg', layers: [{ ...l.layers[0], status: 'done', render_url: '/x.jpg' }] })) }
    const calls = mockApi({ photos: [fullPhoto({ target: 0, target_source: 'match' })], looks: () => done })
    renderAt('/studio/s1')
    const chip = await screen.findByTestId('dressing')
    expect(within(chip).getByRole('img', { name: 'Person 1' })).toBeTruthy()
    fireEvent.click(within(chip).getByRole('button', { name: 'Change' }))
    fireEvent.click(within(chip).getByRole('radio', { name: 'Person 2' }))
    expect(await within(chip).findByText('You changed who we dress. Rebuild looks to apply.')).toBeTruthy()
    expect(targetPosts(calls)[0].body).toEqual({ index: 1 })
    fireEvent.click(within(chip).getByRole('button', { name: 'Build three new looks' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, build new looks' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/looks'))?.body).toEqual({ replan: true }))
  })
})
