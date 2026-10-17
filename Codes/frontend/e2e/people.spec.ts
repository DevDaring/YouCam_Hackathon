/**
 * Group photos: "who should we dress?" — real dev backend (MOCK mode) with two AI-generated people.
 * couple_ai.jpg: the bride is on the LEFT (person 1, index 0); bride_close_ai.jpg is her close-up.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COUPLE = path.join(HERE, 'fixtures', 'couple_ai.jpg')
const BRIDE_CLOSE = path.join(HERE, 'fixtures', 'bride_close_ai.jpg')
/** 360 px screenshots of the picker (phone project only). */
const SHOTS = process.env.E2E_SHOTS ?? ''

async function login(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByRole('button', { name: 'Fill in' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

async function newSession(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo family' }).click()
  await expect(page.getByRole('heading', { name: "Here's your event" })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Continue to photo' }).click()
  await expect(page).toHaveURL(/\/photo\/[0-9a-f-]{36}$/)
  return page.url().split('/photo/')[1]
}

async function fullTarget(page: Page, sid: string) {
  const s = await (await page.request.get(`/api/sessions/${sid}`)).json()
  const full = s.photos.find((p: { kind: string }) => p.kind === 'full')
  return { target: full.target as number | null, source: full.target_source as string | null }
}

const picker = (page: Page) => page.getByTestId('person-picker')
/** Tap the face (the label), the way a person would; the radio itself is visually hidden. */
const tap = (page: Page, name: string) => picker(page).locator('label', { hasText: name }).click()
const radio = (page: Page, name: string) => picker(page).getByRole('radio', { name })

async function shot(page: Page, isMobile: boolean, file: string, focus: Locator = picker(page)) {
  if (!SHOTS || !isMobile) return
  mkdirSync(SHOTS, { recursive: true })
  await focus.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: false })
}

async function looksRender(page: Page) {
  const looksSection = page.getByRole('region', { name: 'Your three looks' })
  await expect(looksSection.getByRole('progressbar')).toHaveCount(3, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^Open .+ layer by layer$/ }).first()).toBeVisible({ timeout: 60_000 })
}

test.describe('who should we dress?', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize({ width: 360, height: 780 })
    await login(page)
  })

  test('group photo → picker; face close-up → matched to the bride; studio renders on her', async ({ page, isMobile }) => {
    test.setTimeout(180_000)
    const sid = await newSession(page)

    await page.getByTestId('photo-upload-input').setInputFiles(COUPLE)
    await expect(picker(page)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('radiogroup', { name: 'We found 2 people in this photo. Who should we dress?' })).toBeVisible()
    await expect(picker(page).getByRole('radio')).toHaveCount(2)
    await expect(page.getByText(/Tip: add a face close-up next/)).toBeVisible()
    await expect(radio(page, 'Person 1')).not.toBeChecked()
    // Face thumbnails really load (owner-only crops).
    await expect.poll(() => picker(page).locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
    await shot(page, isMobile, 'photo-picker-360.png')
    expect(await fullTarget(page, sid)).toEqual({ target: null, source: null })

    await page.getByRole('button', { name: /Use this photo|Continue anyway/ }).click()
    await expect(page.getByRole('heading', { name: 'A close-up of your face' })).toBeVisible()
    await page.getByTestId('photo-upload-input').setInputFiles(BRIDE_CLOSE)
    await expect(page.getByText('We matched you in the group photo ✓')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('person-summary').getByRole('img', { name: 'Person 1' })).toBeVisible()
    expect(await fullTarget(page, sid)).toEqual({ target: 0, source: 'match' })
    await shot(page, isMobile, 'face-matched-360.png', page.getByTestId('person-summary'))

    // "Not you? Choose" reopens the picker with the bride selected.
    await page.getByRole('button', { name: 'Not you? Choose' }).click()
    await expect(radio(page, 'Person 1')).toBeChecked()
    await expect(radio(page, 'Person 2')).not.toBeChecked()

    await page.getByRole('button', { name: /Use this photo|Continue anyway/ }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/${sid}$`))
    await expect(page.getByTestId('dressing').getByRole('img', { name: 'Person 1' })).toBeVisible()
    await expect(page.getByTestId('person-picker')).toHaveCount(0) // already matched: no question in the studio
    await looksRender(page)
  })

  test('no choice yet → studio asks; tap → looks start; change to person 2 → rebuild', async ({ page, isMobile }) => {
    test.setTimeout(300_000)
    const sid = await newSession(page)
    await page.getByTestId('photo-upload-input').setInputFiles(COUPLE)
    await expect(picker(page)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /Use this photo|Continue anyway/ }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/${sid}$`))

    // POST /looks said person_required → the picker shows inline.
    await expect(page.getByRole('radiogroup', { name: 'We found 2 people in this photo. Who should we dress?' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Your three looks start as soon as you choose.')).toBeVisible()
    await shot(page, isMobile, 'studio-picker-360.png')
    await tap(page, 'Person 1')
    await looksRender(page)
    expect(await fullTarget(page, sid)).toEqual({ target: 0, source: 'user' })

    // Change who gets dressed after the looks exist → explain, then rebuild.
    const dressing = page.getByTestId('dressing')
    await dressing.getByRole('button', { name: 'Change' }).click()
    await dressing.locator('label', { hasText: 'Person 2' }).click()
    await expect(dressing.getByRole('radio', { name: 'Person 2' })).toBeChecked()
    await shot(page, isMobile, 'studio-change-360.png', dressing)
    await expect(dressing.getByText('You changed who we dress. Rebuild looks to apply.')).toBeVisible()
    await expect.poll(() => fullTarget(page, sid)).toEqual({ target: 1, source: 'user' })
    await dressing.getByRole('button', { name: 'Done' }).click()
    await expect(dressing.getByRole('img', { name: 'Person 2' })).toBeVisible()
    await shot(page, isMobile, 'studio-dressing-360.png', dressing)

    const rebuild = dressing.getByRole('button', { name: 'Build three new looks' })
    await expect(rebuild).toBeEnabled({ timeout: 150_000 })
    await rebuild.click()
    await page.getByRole('button', { name: 'Yes, build new looks' }).click()
    await expect(page.getByText(/^1 rebuild left/)).toBeVisible({ timeout: 20_000 })
    await expect(dressing.getByText('You changed who we dress. Rebuild looks to apply.')).toHaveCount(0)
    await looksRender(page)
  })
})
