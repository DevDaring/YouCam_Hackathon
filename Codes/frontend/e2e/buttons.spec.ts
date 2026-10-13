/**
 * Every button, link and control in the app, exercised in a real browser.
 * Phone (Pixel 7) and desktop projects; fake camera + fake GPS (Kolkata).
 */
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORTRAIT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'portrait.png')

async function fresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
}

async function login(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Fill in' }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** Creates a session through the real UI (demo family → consent → continue) and returns its id. */
async function newSession(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try the demo family' }).click()
  await expect(page.getByRole('heading', { name: "Here's your event" })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Continue to photo' }).click()
  await expect(page).toHaveURL(/\/photo\/[0-9a-f-]{36}$/)
  return page.url().split('/photo/')[1]
}

test.describe('public pages', () => {
  test.beforeEach(async ({ page }) => fresh(page))

  test('landing: hero controls, CTAs, logo, skip link', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: "Your look. Your family's yes." })).toBeVisible()

    // Hero animation controls: pause → play, next bride.
    await page.getByRole('button', { name: 'Pause animation' }).click()
    await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible()
    await expect(page.getByText('Bengali bride', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next bride' }).click()
    await expect(page.getByText('Christian bride', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Play animation' }).click()
    await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible()

    // Skip link (first Tab on a fresh page) moves focus to <main>.
    await page.reload()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()

    // "Start my look" when signed out → login, which returns to /start.
    await page.getByRole('main').getByRole('link', { name: /Start my look/ }).click()
    await expect(page).toHaveURL(/\/login\?next=%2Fstart/)
    // Logo goes home.
    await page.getByRole('link', { name: 'DearYou — go to home page' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('countries list retry button recovers from an API error', async ({ page }) => {
    await page.route('**/api/regions', (r) => r.fulfill({ status: 500, body: '{}' }))
    await page.goto('/')
    const retry = page.getByRole('button', { name: 'Try again' }).first()
    await expect(retry).toBeVisible()
    await page.unroute('**/api/regions')
    await retry.click()
    await expect(page.getByText('Bangladesh').first()).toBeVisible()
  })

  test('location sheet: open, country, city, use my location, not now, done, close', async ({ page }) => {
    await page.goto('/')
    const chip = page.getByRole('button', { name: /Location: India/ })
    await chip.click()
    const sheet = page.getByRole('dialog', { name: 'Where is the celebration?' })
    await expect(sheet).toBeVisible()

    await sheet.getByLabel('Country').selectOption('BD')
    await sheet.getByLabel('City').selectOption('Dhaka')
    await sheet.getByRole('button', { name: 'Use my location' }).click()
    await sheet.getByRole('button', { name: 'Not now' }).click()
    await expect(sheet.getByRole('button', { name: 'Use my location' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Use my location' }).click()
    await sheet.getByRole('button', { name: 'OK, find my city' }).click()
    await expect(sheet.getByText('Found you near Kolkata, India.')).toBeVisible()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /Location: Kolkata, India/ })).toBeVisible()

    await page.getByRole('button', { name: /Location: Kolkata/ }).click()
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toBeHidden()
  })

  test('language switcher: Bengali, Hindi, English', async ({ page, isMobile }) => {
    await page.goto('/')
    const pick = async (code: string, label: string) => {
      if (isMobile) await page.getByRole('combobox', { name: 'Language' }).selectOption(code)
      else await page.getByRole('button', { name: label, exact: true }).click()
    }
    await pick('bn', 'বাংলা')
    await expect(page.getByRole('heading', { level: 1, name: 'আপনার সাজ। আপনার পরিবারের হ্যাঁ।' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'bn')
    if (isMobile) await page.getByRole('combobox').first().selectOption('hi')
    else await page.getByRole('button', { name: 'हिन्दी', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'आपका लुक। आपके परिवार की हाँ।' })).toBeVisible()
    if (isMobile) await page.getByRole('combobox').first().selectOption('en')
    else await page.getByRole('button', { name: 'English', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: "Your look. Your family's yes." })).toBeVisible()
  })

  test('theme toggle cycles Auto → Light → Dark → Auto', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Colour theme: Auto/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: /Colour theme: Light/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: /Colour theme: Dark/ }).click()
    await expect(page.getByRole('button', { name: /Colour theme: Auto/ })).toBeVisible()
  })

  test('placeholder and 404 pages have a working way home', async ({ page }) => {
    await page.goto('/room/abc123')
    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'This page wandered off' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('login', () => {
  test.beforeEach(async ({ page }) => fresh(page))

  test('wrong password, show/hide, fill in, sign in, sign out', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to DearYou' })).toBeVisible()

    await page.getByLabel('Username').fill('TestUser')
    await page.getByLabel('Password', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText("That username and password don't match. Please try again.")

    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Hide password' }).click()
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')

    await page.getByRole('button', { name: 'Fill in' }).click()
    await expect(page.getByLabel('Username')).toHaveValue('TestUser')
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('TestUser11')
    await expect(page.getByRole('button', { name: 'Filled in — now tap Sign in' })).toBeVisible()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/start$/)

    await page.getByRole('button', { name: 'Signed in as TestUser. Sign out' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })
})

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await fresh(page)
    await login(page)
  })

  test('event setup: every option, back, edit buttons, consent, continue to photo', async ({ page }) => {
    await page.goto('/start')
    const next = page.getByRole('button', { name: 'Continue', exact: true })
    const heading = (name: string) => expect(page.getByRole('heading', { name })).toBeVisible()

    await heading('Confirm your location')
    await next.click()

    await heading('Who are you dressing as?')
    await expect(next).toBeDisabled()
    for (const r of ['Groom', 'Family member', 'Guest', 'Bride']) await page.getByText(r, { exact: true }).click()
    await next.click()

    await heading('Which event?')
    await expect(next).toBeDisabled()
    for (const e of ['Haldi', 'Mehendi', 'Sangeet', 'Wedding']) await page.getByText(e, { exact: true }).click()
    await next.click()

    await heading('When is it?')
    const date = page.getByLabel('Event date')
    await date.fill('2020-01-01')
    await expect(next).toBeDisabled()
    await date.fill('2027-02-14')
    await expect(next).toBeEnabled()
    await next.click()

    await heading("What's your budget?")
    const presets = page.getByRole('radio')
    for (let i = 0; i < (await presets.count()); i++) await presets.nth(i).check({ force: true })
    await page.getByLabel(/Or enter your own amount/).fill('60000')
    await next.click()

    await heading("What's your style?")
    for (const s of ['Traditional', 'Modern', 'Minimal', 'Statement']) await page.getByText(s, { exact: true }).click()
    for (const s of ['Minimal', 'Statement']) await page.getByText(s, { exact: true }).click()
    await next.click()

    await heading("Here's your event")
    await expect(page.getByText('Traditional · Modern')).toBeVisible()

    // Back from summary, then forward again.
    await page.getByRole('button', { name: 'Back' }).click()
    await heading("What's your style?")
    await next.click()

    // Every Edit button opens its step; Continue returns to the summary.
    for (const [field, title] of [
      ['Location', 'Confirm your location'],
      ['Role', 'Who are you dressing as?'],
      ['Event', 'Which event?'],
      ['Date', 'When is it?'],
      ['Budget', "What's your budget?"],
      ['Style', "What's your style?"],
    ]) {
      await page.getByRole('button', { name: `Edit ${field}` }).click()
      await heading(title)
      const from = Number((await page.getByText(/^Step \d of 7$/).textContent())?.match(/\d/)?.[0])
      for (let n = from + 1; n <= 7; n++) {
        await next.click()
        await expect(page.getByText(`Step ${n} of 7`)).toBeVisible()
      }
      await heading("Here's your event")
    }

    const go = page.getByRole('button', { name: 'Continue to photo' })
    await expect(go).toBeDisabled()
    await page.getByRole('checkbox').check()
    await go.click()
    await expect(page).toHaveURL(/\/photo\//)
  })

  test('start over resets the setup', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try the demo family' }).click()
    await expect(page.getByRole('heading', { name: "Here's your event" })).toBeVisible()
    await page.getByRole('button', { name: 'Start over' }).click()
    await expect(page.getByRole('heading', { name: 'Confirm your location' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled() // role cleared
  })

  test('try the demo family fills every answer', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Try the demo family' }).click()
    await expect(page.getByRole('heading', { name: "Here's your event" })).toBeVisible()
    for (const v of ['Bride', 'Wedding', 'Traditional']) await expect(page.getByText(v, { exact: true })).toBeVisible()
    await expect(page.getByText('Not set')).toHaveCount(0)
  })

  test('camera: open, light check, timer, flip, close, escape, capture, retake', async ({ page }) => {
    await newSession(page)
    const dialog = page.getByRole('dialog', { name: 'Full-length photo' })

    await page.getByRole('button', { name: 'Take my photo' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/Light ✓|Too dark|Too bright/)).toBeVisible()
    await dialog.getByRole('button', { name: /Self-timer: 3 seconds/ }).click()
    await dialog.getByRole('button', { name: /Self-timer: 10 seconds/ }).click()
    await expect(dialog.getByRole('button', { name: /Self-timer: 0 seconds/ })).toBeVisible()
    await dialog.getByRole('button', { name: 'Switch camera' }).click()
    await expect(dialog.getByText(/Light ✓|Too dark|Too bright/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Take my photo' }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // Self-timer path: 3-second countdown then capture.
    await page.getByRole('button', { name: 'Take my photo' }).click()
    await expect(dialog.getByRole('button', { name: 'Take photo' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Take photo' }).click()
    await expect(page.getByRole('list', { name: 'Photo check' })).toBeVisible({ timeout: 20_000 })
    // The fake camera shows a test pattern, not a person — reported honestly.
    await expect(page.getByText("We couldn't find a face — face the camera in good light")).toBeVisible()
    await expect(page.getByRole('button', { name: /Continue anyway/ })).toBeVisible()
    await page.getByRole('button', { name: 'Retake' }).click()
    await expect(page.getByRole('button', { name: 'Take my photo' })).toBeVisible()
  })

  test('upload: full photo, back, face photo, skip, studio buttons, footer links', async ({ page }) => {
    const sid = await newSession(page)

    // Upload a photo (real file chooser from the label).
    const chooser = page.waitForEvent('filechooser')
    await page.getByText('Upload a photo', { exact: true }).click()
    await (await chooser).setFiles(PORTRAIT)
    await expect(page.getByText('Face found')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('img', { name: 'Your full-length photo' })).toBeVisible()
    await page.getByRole('button', { name: /Use this photo/ }).click()

    await expect(page.getByRole('heading', { name: 'A close-up of your face' })).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: 'Your full-length photo' })).toBeVisible()
    await page.getByRole('button', { name: /Use this photo/ }).click()

    const chooser2 = page.waitForEvent('filechooser')
    await page.getByText('Upload a photo', { exact: true }).click()
    await (await chooser2).setFiles(PORTRAIT)
    await expect(page.getByText(/Face fills the frame|Move closer so your face/)).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: /Use this photo/ }).click()

    await expect(page).toHaveURL(new RegExp(`/studio/${sid}$`))
    await expect(page.getByRole('heading', { name: 'Your look studio' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Your face close-up' })).toBeVisible()
    // Bride → the three looks start rendering on their own; each card is named after its look.
    for (const n of ['Sindoor Dusk', 'Marigold Morning', 'Ivory Moon']) await expect(page.getByRole('heading', { level: 3, name: n })).toBeAttached()
    await expect(page.getByText('Waiting for try-on')).toHaveCount(0)

    await page.getByRole('link', { name: 'Retake photos' }).click()
    await expect(page).toHaveURL(new RegExp(`/photo/${sid}$`))
    await page.goto(`/studio/${sid}`)
    await page.getByRole('link', { name: 'Edit event' }).click()
    await expect(page).toHaveURL(/\/start$/)

    const footer = page.getByRole('contentinfo')
    await footer.getByRole('link', { name: 'Look studio' }).click()
    await expect(page.getByRole('heading', { name: 'Your look studio' })).toBeVisible()
    await footer.getByRole('link', { name: 'Start my look' }).click()
    await expect(page).toHaveURL(/\/start$/)
  })

  test('face step skip and back-to-setup link', async ({ page }) => {
    const sid = await newSession(page)
    await page.getByRole('link', { name: 'Back to event setup' }).click()
    await expect(page).toHaveURL(/\/start$/)
    await page.goto(`/photo/${sid}`)
    await page.locator('input[type=file]').setInputFiles(PORTRAIT)
    await page.getByRole('button', { name: /Use this photo/ }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page.getByRole('heading', { name: 'Your look studio' })).toBeVisible()
    await expect(page.getByText("No close-up — that's fine")).toBeVisible()
  })

  test('look studio: auto-start, layers render, lightbox stepper, rebuild', async ({ page }) => {
    test.setTimeout(180_000)
    const sid = await newSession(page)
    await page.locator('input[type=file]').setInputFiles(PORTRAIT)
    await page.getByRole('button', { name: /Use this photo/ }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/${sid}$`))

    // Demo family is a bride: the first round starts by itself (no wear chooser), and says how it works.
    await expect(page.getByText(/rendered live by YouCam on your own photo/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Which looks should we build?' })).toHaveCount(0)
    const looksSection = page.getByRole('region', { name: 'Your three looks' })
    await expect(looksSection.getByRole('progressbar')).toHaveCount(3, { timeout: 20_000 })

    // Mock renders take ~1–2 s a layer: wait for the first finished layer, then open that look.
    const open = page.getByRole('button', { name: /^Open .+ layer by layer$/ }).first()
    await expect(open).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/^[1-5] of [25] layers$/).first()).toBeVisible()
    await open.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 2 })).toBeVisible()
    const stepText = dialog.getByText(/^Step \d of \d$/)
    const [, cur, total] = (await stepText.textContent())!.match(/Step (\d) of (\d)/)!
    expect(Number(cur)).toBe(Number(total))
    expect(Number(total)).toBeGreaterThanOrEqual(2)
    await expect(dialog.getByRole('button', { name: 'Next layer' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Previous layer' }).click()
    await expect(stepText).toHaveText(`Step ${Number(total) - 1} of ${total}`)
    await dialog.getByRole('button', { name: 'Your photo' }).click()
    await expect(stepText).toHaveText(`Step 1 of ${total}`)
    await expect(dialog.getByRole('button', { name: 'Previous layer' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Next layer' }).click()
    await expect(stepText).toHaveText(`Step 2 of ${total}`)
    await expect(dialog.getByText('AI-generated product image').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await open.click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    // Rebuild unlocks once every look has finished; confirm, then a fresh round starts.
    const rebuild = page.getByRole('button', { name: 'Build three new looks' })
    await expect(page.getByText(/^2 rebuilds left/)).toBeVisible()
    await expect(rebuild).toBeEnabled({ timeout: 150_000 })
    await rebuild.click()
    await page.getByRole('button', { name: 'Keep these looks' }).click()
    await rebuild.click()
    await page.getByRole('button', { name: 'Yes, build new looks' }).click()
    await expect(page.getByText(/^1 rebuild left/)).toBeVisible({ timeout: 20_000 })
    await expect(rebuild).toBeDisabled()
  })

  test('look studio editor: swap necklace, lipstick shade, remove and add back', async ({ page }) => {
    test.setTimeout(240_000)
    const sid = await newSession(page)
    await page.locator('input[type=file]').setInputFiles(PORTRAIT)
    await page.getByRole('button', { name: /Use this photo/ }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/${sid}$`))

    // Change stays disabled while Look 1 renders; it unlocks once the look is finished.
    const changeNecklace = page.getByRole('button', { name: 'Change necklace for Look 1' })
    await expect(changeNecklace).toBeVisible({ timeout: 20_000 })
    await expect(changeNecklace).toBeEnabled({ timeout: 120_000 })
    await expect(page.getByText('Tap Change on any layer to swap pieces, makeup or hair.')).toBeVisible()
    const toast = page.getByRole('status').filter({ hasText: /re-rendering|updating the look/ })

    // 1. Swap the necklace for another catalogue piece.
    await changeNecklace.click()
    let sheet = page.getByRole('dialog', { name: 'Change necklace · Look 1 Sindoor Dusk' })
    await expect(sheet).toBeVisible()
    const apply = sheet.getByRole('button', { name: 'Apply & re-render' })
    await expect(sheet.getByRole('radio').first()).toBeAttached()
    await expect(apply).toBeDisabled()
    await expect(sheet.getByText('AI-generated product image').first()).toBeVisible()
    await sheet.getByRole('button', { name: 'Price: low to high' }).click()
    const other = sheet.locator('label', { has: page.getByRole('radio', { checked: false }) }).first()
    await other.click()
    await expect(sheet.getByText(/ → .* · total /)).toBeVisible()
    await expect(sheet.getByText(/^Re-renders necklace, earrings, makeup,? and hair · about \d+ YouCam units? · ~\d+ min$/)).toBeVisible()
    await expect(sheet.getByText(/\d+ edits? left/)).toBeVisible()
    await apply.click()
    await expect(sheet).toBeHidden()
    await expect(toast).toHaveText('Necklace changed — re-rendering')
    await expect(changeNecklace).toBeDisabled()
    await expect(changeNecklace).toBeEnabled({ timeout: 90_000 })

    // 2. Keep the makeup mood, change only the lipstick shade.
    await page.getByRole('button', { name: 'Change makeup for Look 1' }).click()
    sheet = page.getByRole('dialog', { name: 'Change makeup · Look 1 Sindoor Dusk' })
    const shades = sheet.getByRole('group', { name: 'Lipstick shade' })
    await expect(shades.getByRole('radio', { name: 'Plum' })).toBeAttached()
    await shades.locator('label', { has: page.getByRole('radio', { name: 'Plum' }) }).click()
    await expect(shades.getByRole('radio', { name: 'Plum' })).toBeChecked()
    await sheet.getByRole('button', { name: 'Apply & re-render' }).click()
    await expect(sheet).toBeHidden()
    await expect(toast).toHaveText('Makeup changed — re-rendering')
    await expect(changeNecklace).toBeEnabled({ timeout: 90_000 })

    // 3. Remove the necklace, then add it back from the card.
    await changeNecklace.click()
    sheet = page.getByRole('dialog', { name: 'Change necklace · Look 1 Sindoor Dusk' })
    await sheet.getByRole('button', { name: /Remove necklace/ }).click()
    await expect(sheet.getByText(/ → removed/)).toBeVisible()
    await sheet.getByRole('button', { name: 'Apply & re-render' }).click()
    await expect(sheet).toBeHidden()
    await expect(toast).toHaveText('Necklace removed — updating the look')
    const addBack = page.getByRole('button', { name: 'Add necklace back to Look 1' })
    await expect(addBack).toBeVisible()
    await expect(page.getByRole('list', { name: 'Sindoor Dusk layers' }).getByText('Removed', { exact: true })).toBeVisible()
    await expect(addBack).toBeEnabled({ timeout: 90_000 })
    await addBack.click()
    await expect(toast).toHaveText('Necklace added back — re-rendering')
    await expect(changeNecklace).toBeVisible()
    await expect(changeNecklace).toBeEnabled({ timeout: 90_000 })

    // Cancel and Escape both close the sheet without a change.
    await page.getByRole('button', { name: 'Change hair for Look 1' }).click()
    sheet = page.getByRole('dialog', { name: 'Change hair · Look 1 Sindoor Dusk' })
    await expect(sheet.getByRole('radio', { checked: true })).toBeAttached()
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toBeHidden()
    await page.getByRole('button', { name: 'Change outfit for Look 1' }).click()
    sheet = page.getByRole('dialog', { name: 'Change outfit · Look 1 Sindoor Dusk' })
    await expect(sheet.getByRole('button', { name: /Remove outfit/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  })

  test('enhance: sharpen a photo, restore it, then enhance a finished look with before/after', async ({ page }) => {
    test.setTimeout(240_000)
    const sid = await newSession(page)
    await page.locator('input[type=file]').setInputFiles(PORTRAIT)
    await expect(page.getByText('Face found')).toBeVisible({ timeout: 20_000 })

    // Photo page: enhance → "Enhanced" with restore; restore → button is back; enhance again and keep it.
    const enhancePhoto = page.getByRole('button', { name: 'Enhance photo', exact: true })
    await enhancePhoto.click()
    const restore = page.getByRole('button', { name: 'Restore original' })
    await expect(restore).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText('Enhanced', { exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Your full-length photo' })).toBeVisible()
    await restore.click()
    await expect(enhancePhoto).toBeVisible({ timeout: 30_000 })
    await enhancePhoto.click()
    await expect(restore).toBeVisible({ timeout: 90_000 })
    await page.getByRole('button', { name: /Use this photo/ }).click()
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(new RegExp(`/studio/${sid}$`))
    await expect(page.getByRole('region', { name: 'Your photos' }).getByText('Enhanced', { exact: true })).toBeVisible()

    // Look card: enhance once the look has finished, compare before/after, open the lightbox, remove.
    const enhanceLook = page.getByRole('button', { name: 'Enhance photo: Sindoor Dusk' })
    await expect(enhanceLook).toBeEnabled({ timeout: 120_000 })
    await expect(page.getByText(/^Sharpens detail and clarity · 2 YouCam units$/).first()).toBeVisible()
    await enhanceLook.click()
    await expect(page.getByRole('status').filter({ hasText: 'Enhancing Sindoor Dusk' })).toBeVisible()
    const compare = page.getByRole('group', { name: 'Compare Sindoor Dusk before and after enhancing' })
    await expect(compare).toBeVisible({ timeout: 60_000 })
    const after = compare.getByRole('button', { name: 'After' })
    await expect(after).toHaveAttribute('aria-pressed', 'true')
    const open = page.getByRole('button', { name: 'Open Sindoor Dusk layer by layer' })
    await expect(open.locator('img[alt$=", enhanced"]')).toBeVisible()
    await compare.getByRole('button', { name: 'Before' }).click()
    await expect(after).toHaveAttribute('aria-pressed', 'false')
    await expect(open.locator('img[alt$=", enhanced"]')).toHaveCount(0)
    await after.click()

    await open.click()
    const dialog = page.getByRole('dialog', { name: 'Sindoor Dusk' })
    await expect(dialog.getByRole('img', { name: 'Sindoor Dusk look, Enhanced' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Remove enhancement: Sindoor Dusk' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Enhancement removed from Sindoor Dusk' })).toBeVisible()
    await expect(compare).toHaveCount(0)
    await expect(enhanceLook).toBeVisible()
  })

  test('camera blocked: friendly message and upload instead', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    })
    await newSession(page)
    await page.getByRole('button', { name: 'Take my photo' }).click()
    const dialog = page.getByRole('dialog', { name: 'Full-length photo' })
    await expect(dialog.getByRole('alert')).toHaveText(/Camera access was blocked/)
    const chooser = page.waitForEvent('filechooser')
    await dialog.getByText('Upload a photo', { exact: true }).click()
    await (await chooser).setFiles(PORTRAIT)
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Face found')).toBeVisible({ timeout: 20_000 })
  })
})
