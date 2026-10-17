import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { CameraCapture } from '../components/photo/CameraCapture'
import i18n from '../i18n'
import { AuthProvider } from '../lib/auth'
import { cameraConstraints, openCamera, PERMISSION_TIMEOUT_MS, READY_TIMEOUT_MS } from '../lib/camera'
import { isInAppBrowser, isMobileDevice } from '../lib/device'
import { RegionProvider } from '../lib/region'

const REGIONS = {
  countries: [{ code: 'IN', currency: 'INR', locales: ['en', 'hi', 'bn'], timezones: ['Asia/Kolkata'], events: ['haldi'], budget_presets: [25000], cities: [{ name: 'Kolkata', lat: 22.57, lon: 88.36 }] }],
  events: {},
}
const SESSION = { id: 's1', country_code: 'IN', city: 'Kolkata', role: 'bride', event_type: 'haldi', event_date: '2027-02-14', budget_amount: '75000', currency: 'INR', style_tags: ['traditional'], delete_after: null, photos: [] as unknown[] }
const PHOTO = { kind: 'full', width: 1200, height: 1600, url: '/api/sessions/s1/photos/full?v=abc', quality: { ok: true, checks: [{ key: 'light', status: 'pass', value: 120 }] } }

const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0'

function mockApi() {
  const uploads: FormData[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    if (url.startsWith('/api/regions')) return json(REGIONS)
    if (url.startsWith('/api/geo/guess')) return json({ country_code: 'IN', source: 'timezone' })
    if (url.startsWith('/api/auth/me')) return json({ username: 'TestUser', display_name: 'Jury demo', is_demo: true })
    if (url === '/api/sessions/s1/photos' && init?.method === 'POST') {
      const form = init.body as FormData
      uploads.push(form)
      return json({ ...PHOTO, kind: form.get('kind') })
    }
    if (url === '/api/sessions/s1') return json(SESSION)
    return json({}, 404)
  })
  return uploads
}

function renderPhoto() {
  return render(
    <RegionProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/photo/s1']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </RegionProvider>,
  )
}

/** Phone: `(pointer: coarse)` matches (everything else, e.g. reduced motion, does not). */
function asPhone() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('pointer: coarse'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
}

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn(), kind: 'video' }
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream }
}

function withGetUserMedia(impl: (c: MediaStreamConstraints) => Promise<MediaStream>) {
  const gum = vi.fn(impl)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: gum }, configurable: true })
  return gum
}

const named = (name: string) => Object.assign(new Error(name), { name })

beforeEach(async () => {
  localStorage.clear()
  await i18n.changeLanguage('en')
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('device detection', () => {
  it('a coarse pointer means phone, a fine one means desktop', () => {
    expect(isMobileDevice()).toBe(false)
    asPhone()
    expect(isMobileDevice()).toBe(true)
  })

  it('recognises in-app browsers', () => {
    expect(isInAppBrowser(IG_UA)).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 WhatsApp/2.24')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/450.0]')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBe(false)
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false)
  })
})

describe('photo step on a phone: native camera', () => {
  it('"Take my photo" opens the phone camera (capture=environment, then user) and uploads as source "camera"', async () => {
    asPhone()
    const uploads = mockApi()
    const clicks: HTMLInputElement[] = []
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      clicks.push(this)
    })
    renderPhoto()
    await screen.findByRole('heading', { level: 1, name: 'Your full-length photo' })

    const camInput = screen.getByTestId('photo-camera-input') as HTMLInputElement
    expect(camInput.getAttribute('capture')).toBe('environment')
    expect(camInput.accept).toBe('image/*')
    expect(screen.getByTestId('photo-upload-input').hasAttribute('capture')).toBe(false)
    expect(screen.getByText('Upload a photo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use live camera with guide' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Take my photo' }))
    expect(clicks).toEqual([camInput]) // synchronous click on the capture input, inside the gesture
    expect(screen.queryByRole('dialog')).toBeNull() // no live camera

    fireEvent.change(camInput, { target: { files: [new File([new Uint8Array(10)], 'IMG_0001.jpg', { type: 'image/jpeg' })] } })
    await screen.findByText('Good light')
    expect(uploads).toHaveLength(1)
    expect(uploads[0].get('source')).toBe('camera')
    expect(uploads[0].get('kind')).toBe('full')

    fireEvent.click(screen.getByRole('button', { name: /Use this photo/ }))
    await screen.findByRole('heading', { level: 1, name: 'A close-up of your face' })
    expect((screen.getByTestId('photo-camera-input') as HTMLInputElement).getAttribute('capture')).toBe('user')
  })

  it('the live camera is still available; in an in-app browser it suggests Chrome/Safari', async () => {
    asPhone()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IG_UA)
    mockApi()
    withGetUserMedia(() => new Promise(() => {}))
    renderPhoto()
    await screen.findByRole('heading', { level: 1, name: 'Your full-length photo' })
    const hint = "Open this page in Chrome or Safari for the live camera — or use your phone's camera button."
    expect(screen.getByText(hint)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use live camera with guide' }))
    expect(await screen.findByRole('dialog', { name: 'Full-length photo' })).toBeTruthy()
  })
})

describe('photo step on desktop: live camera is primary', () => {
  it('has no capture input and "Take my photo" opens the live camera', async () => {
    mockApi()
    withGetUserMedia(async () => fakeStream().stream)
    renderPhoto()
    await screen.findByRole('heading', { level: 1, name: 'Your full-length photo' })
    expect(screen.queryByTestId('photo-camera-input')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Use live camera with guide' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Take my photo' }))
    expect(await screen.findByRole('dialog', { name: 'Full-length photo' })).toBeTruthy()
  })
})

describe('openCamera fallbacks', () => {
  it('retries with simpler constraints on OverconstrainedError / NotReadableError / TypeError', async () => {
    const { stream } = fakeStream()
    const errors = [named('OverconstrainedError'), new TypeError('bad constraints')]
    const gum = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>(async () => {
      const e = errors.shift()
      if (e) throw e
      return stream
    })
    await expect(openCamera('environment', gum)).resolves.toBe(stream)
    expect(gum.mock.calls.map((c) => c[0])).toEqual(cameraConstraints('environment'))
    expect(gum.mock.calls[2][0]).toEqual({ video: true, audio: false })
    expect(gum.mock.calls[1][0]).toEqual({ video: { facingMode: { ideal: 'environment' } }, audio: false })

    const gum2 = vi.fn(async () => {
      throw named('NotReadableError')
    })
    await expect(openCamera('user', gum2)).rejects.toMatchObject({ name: 'NotReadableError' })
    expect(gum2).toHaveBeenCalledTimes(3)
  })

  it('does not retry when the shopper blocked the camera', async () => {
    const gum = vi.fn(async () => {
      throw named('NotAllowedError')
    })
    await expect(openCamera('user', gum)).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(gum).toHaveBeenCalledTimes(1)
  })

  it('CameraCapture walks the fallback list and attaches the stream iOS-safely', async () => {
    const { stream } = fakeStream()
    let n = 0
    const gum = withGetUserMedia(async () => {
      n += 1
      if (n < 3) throw named(n === 1 ? 'OverconstrainedError' : 'NotReadableError')
      return stream
    })
    const { container } = render(<CameraCapture kind="face" fileInputId="up" onCapture={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(gum).toHaveBeenCalledTimes(3))
    expect(gum.mock.calls[0][0]).toMatchObject({ video: { facingMode: { ideal: 'user' }, width: { ideal: 1920 } } })
    expect(gum.mock.calls[2][0]).toEqual({ video: true, audio: false })
    const video = container.querySelector('video') as HTMLVideoElement & { srcObject: unknown }
    await waitFor(() => expect(video.srcObject).toBe(stream))
    expect(video.muted).toBe(true)
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.hasAttribute('webkit-playsinline')).toBe(true)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('CameraCapture watchdog and error states', () => {
  it('shows "The camera didn\'t start" with phone-camera and upload options when no frames arrive', async () => {
    vi.useFakeTimers()
    const { stream, track } = fakeStream()
    withGetUserMedia(async () => stream)
    render(<CameraCapture kind="full" fileInputId="up" nativeCameraInputId="cam" onCapture={() => {}} onClose={() => {}} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText('Starting camera…')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 50))
    expect(screen.getByRole('alert').textContent).toBe("The camera didn't start.")
    expect(track.stop).toHaveBeenCalled() // tracks are released
    const phone = screen.getByText('Use phone camera').closest('label')!
    expect(phone.getAttribute('for')).toBe('cam')
    expect(screen.getByText('Upload a photo').closest('label')!.getAttribute('for')).toBe('up')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('a stuck permission prompt times out; a stream that arrives later is stopped, not shown', async () => {
    vi.useFakeTimers()
    const { stream, track } = fakeStream()
    let resolve: (s: MediaStream) => void = () => {}
    withGetUserMedia(() => new Promise<MediaStream>((r) => (resolve = r)))
    render(<CameraCapture kind="full" fileInputId="up" onCapture={() => {}} onClose={() => {}} />)
    await act(() => vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 50))
    expect(screen.queryByRole('alert')).toBeNull() // still waiting for the prompt
    await act(() => vi.advanceTimersByTimeAsync(PERMISSION_TIMEOUT_MS))
    expect(screen.getByRole('alert').textContent).toBe("The camera didn't start.")
    await act(async () => resolve(stream))
    expect(track.stop).toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('becomes ready on loadedmetadata (no watchdog) and stops the tracks on unmount', async () => {
    vi.useFakeTimers()
    const { stream, track } = fakeStream()
    withGetUserMedia(async () => stream)
    const { container, unmount } = render(<CameraCapture kind="full" fileInputId="up" onCapture={() => {}} onClose={() => {}} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    fireEvent(container.querySelector('video')!, new Event('loadedmetadata'))
    await act(() => vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS * 2))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Starting camera…')).toBeNull()
    expect((screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement).disabled).toBe(false)
    unmount()
    expect(track.stop).toHaveBeenCalled()
  })

  it('blocked camera on desktop: only upload is offered (no phone camera)', async () => {
    withGetUserMedia(async () => {
      throw named('NotAllowedError')
    })
    render(<CameraCapture kind="full" fileInputId="up" onCapture={() => {}} onClose={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Camera access was blocked/)
    expect(screen.queryByText('Use phone camera')).toBeNull()
    expect(screen.getByText('You can upload a photo instead.')).toBeTruthy()
    expect(screen.getByText('Upload a photo')).toBeTruthy()
  })

  it('in an in-app browser the error suggests Chrome or Safari', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IG_UA)
    withGetUserMedia(async () => {
      throw named('NotAllowedError')
    })
    render(<CameraCapture kind="face" fileInputId="up" nativeCameraInputId="cam" onCapture={() => {}} onClose={() => {}} />)
    await screen.findByRole('alert')
    expect(screen.getByText("Open this page in Chrome or Safari for the live camera — or use your phone's camera button.")).toBeTruthy()
    expect(screen.getByText('Use phone camera')).toBeTruthy()
  })

  it('no getUserMedia at all → unsupported message with alternatives', async () => {
    render(<CameraCapture kind="full" fileInputId="up" nativeCameraInputId="cam" onCapture={() => {}} onClose={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toBe("This browser can't open the live camera here.")
    expect(screen.getByText('Use phone camera')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
