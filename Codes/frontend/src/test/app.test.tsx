import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import i18n from '../i18n'
import { RegionProvider } from '../lib/region'

const REGIONS = {
  countries: [
    {
      code: 'IN',
      currency: 'INR',
      locales: ['en', 'hi', 'bn'],
      timezones: ['Asia/Kolkata'],
      events: ['haldi', 'wedding'],
      budget_presets: [25000, 75000],
      cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }],
    },
    {
      code: 'PK',
      currency: 'PKR',
      locales: ['en'],
      timezones: ['Asia/Karachi'],
      events: ['nikah'],
      budget_presets: [80000],
      cities: [{ name: 'Lahore', lat: 31.5, lon: 74.3 }],
    },
  ],
  events: {},
}

function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.startsWith('/api/regions')) return new Response(JSON.stringify(REGIONS), { status: 200 })
    if (url.startsWith('/api/geo/guess')) return new Response(JSON.stringify({ country_code: 'IN', source: 'timezone' }), { status: 200 })
    return new Response('{}', { status: 404 })
  })
}

function renderAt(path: string) {
  return render(
    <RegionProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </RegionProvider>,
  )
}

describe('app shell', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('renders the landing hero and the supported countries', async () => {
    mockFetch()
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1, name: "Your look. Your family's haan." })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Start my look/ }).getAttribute('href')).toBe('/start')
    expect(await screen.findByText('Pakistan')).toBeTruthy()
    // Timezone guess → India; chip shows it.
    await waitFor(() => expect(screen.getByRole('button', { name: /Location: India/ })).toBeTruthy())
  })

  it('renders placeholder routes with their milestone', async () => {
    mockFetch()
    renderAt('/room/abc123')
    expect(screen.getByRole('heading', { level: 1, name: 'Family Room' })).toBeTruthy()
    expect(screen.getByText('Coming in milestone M4')).toBeTruthy()
  })

  it('switches the UI to Bengali', async () => {
    mockFetch()
    renderAt('/')
    await screen.findByText('Pakistan')
    await i18n.changeLanguage('bn')
    expect(await screen.findByRole('heading', { level: 1, name: 'আপনার সাজ। আপনার পরিবারের হ্যাঁ।' })).toBeTruthy()
  })
})
