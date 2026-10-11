import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import i18n from '../i18n'
import { AuthProvider } from '../lib/auth'
import { RegionProvider } from '../lib/region'

const REGIONS = {
  countries: [{ code: 'IN', currency: 'INR', locales: ['en', 'hi', 'bn'], timezones: ['Asia/Kolkata'], events: ['haldi'], budget_presets: [25000], cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }] }],
  events: {},
}
const SESSION = { id: 's1', country_code: 'IN', city: 'Kolkata', role: 'bride', event_type: 'haldi', event_date: '2027-02-14', budget_amount: '75000', currency: 'INR', style_tags: ['traditional'], delete_after: '2027-01-01T10:00:00Z', photos: [] as unknown[] }
const PHOTO = {
  kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=abc',
  quality: { ok: true, checks: [{ key: 'light', status: 'pass', value: 120 }, { key: 'face', status: 'pass', value: 1 }, { key: 'framing', status: 'warn', value: 0.5 }] },
}

function mockApi() {
  const uploads: FormData[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    if (url.startsWith('/api/regions')) return json(REGIONS)
    if (url.startsWith('/api/geo/guess')) return json({ country_code: 'IN', source: 'timezone' })
    if (url.startsWith('/api/auth/me')) return json({ username: 'TestUser', display_name: 'Jury demo', is_demo: true })
    if (url === '/api/sessions/s1/photos' && init?.method === 'POST') {
      uploads.push(init.body as FormData)
      return json(PHOTO)
    }
    if (url === '/api/sessions/s1') return json({ ...SESSION, photos: uploads.length ? [PHOTO] : [] })
    return json({}, 404)
  })
  return uploads
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

describe('photo step', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('offers camera and upload, uploads a picked file, shows the check, then continues to the studio', async () => {
    const uploads = mockApi()
    renderAt('/photo/s1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Your full-length photo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Take my photo' })).toBeTruthy()
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    expect(input.accept).toContain('image/jpeg')

    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByText('Step back so your whole body fits in the frame')).toBeTruthy()
    expect(screen.getByText('Good light')).toBeTruthy()
    expect(uploads).toHaveLength(1)
    expect(uploads[0].get('kind')).toBe('full')
    expect(uploads[0].get('source')).toBe('upload')

    fireEvent.click(screen.getByRole('button', { name: /Use this photo/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'A close-up of your face' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Your look studio' })).toBeTruthy())
  })
})
