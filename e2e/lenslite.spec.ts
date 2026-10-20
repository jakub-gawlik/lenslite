import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  caption,
  centerImg,
  counter,
  doubleTap,
  drag,
  imgTransform,
  openAt,
  panBounds,
  pinch,
  root,
  SLIDE_MS,
  stageSize,
} from './helpers.js'

test.describe('opening and closing', () => {
  test('opens at the clicked thumbnail with its caption', async ({ page }) => {
    await openAt(page, 1)
    await expect(counter(page)).toHaveText('2 / 3')
    await expect(caption(page)).toHaveText('Two')
    await expect(page.locator('.lenslite__close')).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  })

  test('Escape closes and focus returns to the thumbnail', async ({ page }) => {
    await page.goto('/e2e/fixture.html')
    // Open from the keyboard: Safari never focuses links on click.
    const thumb = page.locator('#grid a').nth(1)
    await thumb.focus()
    await page.keyboard.press('Enter')
    await expect(root(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(root(page)).toHaveCount(0)
    await expect(thumb).toBeFocused()
  })

  test('the IIFE build and standalone stylesheet work from plain script tags', async ({
    page,
  }) => {
    await page.goto('/e2e/iife.html')
    await page.locator('#photo').click()
    await expect(root(page)).toBeVisible()
    await expect(root(page)).toHaveCSS('position', 'fixed')
  })
})

test.describe('page integration', () => {
  test('the page behind is inert while open and restored after', async ({ page }) => {
    await openAt(page, 0)
    await expect(page.locator('#grid')).toHaveAttribute('inert', '')
    await page.keyboard.press('Escape')
    await expect(page.locator('#grid')).not.toHaveAttribute('inert')
  })

  test('thumbnails added after setup open in the gallery', async ({ page }) => {
    await page.goto('/e2e/fixture.html')
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = (document.querySelector('#grid a') as HTMLAnchorElement).href
      a.dataset.caption = 'Late'
      a.textContent = 'late'
      a.id = 'late'
      document.getElementById('grid')!.appendChild(a)
    })
    await page.locator('#late').click()
    await expect(counter(page)).toHaveText('4 / 4')
    await expect(caption(page)).toHaveText('Late')
  })
})

test.describe('navigation', () => {
  test('arrow keys move between images', async ({ page }) => {
    await openAt(page, 0)
    await page.keyboard.press('ArrowRight')
    await expect(counter(page)).toHaveText('2 / 3')
    // The bundled stylesheet times the slide with the same SLIDE_MS.
    await expect(page.locator('.lenslite__track')).toHaveCSS(
      'transition-duration',
      `${SLIDE_MS / 1000}s`,
    )
    await page.waitForTimeout(SLIDE_MS + 50)
    await page.keyboard.press('ArrowLeft')
    await expect(counter(page)).toHaveText('1 / 3')
  })

  test('a fast horizontal drag goes to the next image', async ({ page }) => {
    await openAt(page, 0)
    const { width, height } = await stageSize(page)
    await drag(
      page,
      { x: width * 0.7, y: height / 2 },
      { x: width * 0.5, y: height / 2 },
      { steps: 3 },
    )
    await expect(counter(page)).toHaveText('2 / 3')
    await expect(caption(page)).toHaveText('Two')
  })

  test('a slow, short drag snaps back', async ({ page }) => {
    await openAt(page, 1)
    const { width, height } = await stageSize(page)
    // Under a quarter of the stage width and well below flick velocity.
    await drag(
      page,
      { x: width * 0.6, y: height / 2 },
      { x: width * 0.6 - width * 0.15, y: height / 2 },
      { duration: 1500 },
    )
    await page.waitForTimeout(SLIDE_MS + 50)
    await expect(counter(page)).toHaveText('2 / 3')
    await expect(page.locator('.lenslite__track')).toHaveCSS(
      'transform',
      /matrix\(1, 0, 0, 1, 0, 0\)|none/,
    )
  })

  test('dragging past the last image rubber-bands without looping', async ({ page }) => {
    await openAt(page, 2)
    const { width, height } = await stageSize(page)
    await drag(
      page,
      { x: width * 0.8, y: height / 2 },
      { x: width * 0.2, y: height / 2 },
      { steps: 3 },
    )
    await page.waitForTimeout(SLIDE_MS + 50)
    await expect(counter(page)).toHaveText('3 / 3')
  })

  test('with loop on, dragging past the last image wraps to the first', async ({
    page,
  }) => {
    await openAt(page, 2, '?loop')
    const { width, height } = await stageSize(page)
    await drag(
      page,
      { x: width * 0.8, y: height / 2 },
      { x: width * 0.2, y: height / 2 },
      { steps: 3 },
    )
    await expect(counter(page)).toHaveText('1 / 3')
  })
})

/**
 * Pans a 2.5x-zoomed image past its bottom-right clamp. Two diagonal drags
 * across the middle of the stage cover a full stage width and height (the
 * clamp sits at 0.75 of each), stay inside the viewport and avoid the chrome
 * buttons; they are slow so no momentum is added on release.
 */
async function panToBottomRight(page: Page): Promise<void> {
  const { width, height } = await stageSize(page)
  for (let i = 0; i < 2; i++) {
    await drag(
      page,
      { x: width * 0.25, y: height * 0.25 },
      { x: width * 0.75, y: height * 0.75 },
      { duration: 1000 },
    )
  }
}

test.describe('zoom and pan', () => {
  test('double-tap zooms towards the tapped point, double-tap again resets', async ({
    page,
  }) => {
    await openAt(page, 0)
    const { width, height } = await stageSize(page)
    const point = { x: width * 0.5 - 40, y: height * 0.5 - 30 }
    await doubleTap(page, point)
    const zoomed = await imgTransform(page)
    expect(zoomed.scale).toBe(2.5)
    // Zooming towards a point left of / above center pans right / down,
    // within the image's pan bounds (a letterboxed axis stays centered).
    const bounds = await panBounds(page, 2.5)
    expect(zoomed.x).toBeCloseTo(Math.min(40 * 1.5, bounds.x), 0)
    expect(zoomed.y).toBeCloseTo(Math.min(30 * 1.5, bounds.y), 0)
    await page.waitForTimeout(400)
    await doubleTap(page, point)
    expect(await imgTransform(page)).toEqual({ x: 0, y: 0, scale: 1 })
  })

  test('panning while zoomed is clamped to the fitted image box', async ({ page }) => {
    await openAt(page, 0)
    const { width, height } = await stageSize(page)
    expect(width).toBeGreaterThan(0)
    await doubleTap(page, { x: width / 2, y: height / 2 })
    await panToBottomRight(page)
    const { x, y, scale } = await imgTransform(page)
    const bounds = await panBounds(page, scale)
    expect(x).toBeCloseTo(bounds.x, 0)
    expect(y).toBeCloseTo(bounds.y, 0)
  })

  test('a letterboxed image stays centered on its short axis', async ({ page }) => {
    await page.goto('/e2e/fixture.html')
    const portraitViewport = await page.evaluate(() => innerHeight > innerWidth)
    // A landscape photo letterboxes on a portrait screen and vice versa.
    await openAt(page, portraitViewport ? 0 : 1)
    const { width, height } = await stageSize(page)
    await doubleTap(page, { x: width / 2, y: height / 2 })
    const bounds = await panBounds(page, 2.5)
    expect(portraitViewport ? bounds.y : bounds.x).toBe(0)
    await panToBottomRight(page)
    const { x, y } = await imgTransform(page)
    expect(portraitViewport ? y : x).toBe(0)
    expect(portraitViewport ? x : y).toBeCloseTo(
      portraitViewport ? bounds.x : bounds.y,
      0,
    )
  })

  test('a viewport resize re-clamps the pan to the new stage', async ({ page }) => {
    await openAt(page, 0)
    const before = await stageSize(page)
    await doubleTap(page, { x: before.width / 2, y: before.height / 2 })
    await panToBottomRight(page)
    const clamped = await panBounds(page, 2.5)
    expect(clamped.x).toBeGreaterThan(0)
    expect((await imgTransform(page)).x).toBeCloseTo(clamped.x, 0)

    await page.setViewportSize({
      width: Math.round(before.width / 2),
      height: Math.round(before.height / 2),
    })
    await expect
      .poll(async () => (await stageSize(page)).width)
      .toBeLessThan(before.width)
    const after = await panBounds(page, 2.5)
    expect(after.x).toBeLessThan(clamped.x)
    await expect.poll(async () => (await imgTransform(page)).x).toBeCloseTo(after.x, 0)
    expect((await imgTransform(page)).y).toBeCloseTo(after.y, 0)
  })

  test('Escape zooms out first, then closes', async ({ page }) => {
    await openAt(page, 0)
    const { width, height } = await stageSize(page)
    await doubleTap(page, { x: width / 2, y: height / 2 })
    expect((await imgTransform(page)).scale).toBe(2.5)
    await page.keyboard.press('Escape')
    await expect(root(page)).toBeVisible()
    expect(await imgTransform(page)).toEqual({ x: 0, y: 0, scale: 1 })
    await page.keyboard.press('Escape')
    await expect(root(page)).toHaveCount(0)
  })

  test('pinch zooms in, clamped at maxZoom, and pinching back resets', async ({
    page,
  }) => {
    await openAt(page, 0)
    const { width, height } = await stageSize(page)
    const center = { x: width / 2, y: height / 2 }
    await pinch(page, center, 40, 120)
    expect((await imgTransform(page)).scale).toBeCloseTo(3, 1)
    await pinch(page, center, 20, 400)
    expect((await imgTransform(page)).scale).toBe(4)
    await pinch(page, center, 400, 10)
    expect(await imgTransform(page)).toEqual({ x: 0, y: 0, scale: 1 })
  })
})

test.describe('dismissal', () => {
  test('dragging down past the threshold closes', async ({ page }) => {
    await openAt(page, 0)
    const { width, height } = await stageSize(page)
    await drag(
      page,
      { x: width / 2, y: height * 0.3 },
      { x: width / 2, y: height * 0.3 + 200 },
      { duration: 800 },
    )
    await expect(root(page)).toHaveCount(0)
  })

  test('a short vertical drag snaps back', async ({ page }) => {
    await openAt(page, 0)
    const { width, height } = await stageSize(page)
    await drag(
      page,
      { x: width / 2, y: height * 0.3 },
      { x: width / 2, y: height * 0.3 + 40 },
      { duration: 1200 },
    )
    await expect(root(page)).toBeVisible()
    expect(await imgTransform(page)).toEqual({ x: 0, y: 0, scale: 1 })
    await expect(centerImg(page)).toBeVisible()
  })
})

test.describe('history', () => {
  test('the back button closes the viewer without leaving the page', async ({ page }) => {
    await openAt(page, 0)
    const url = page.url()
    await page.goBack()
    await expect(root(page)).toHaveCount(0)
    expect(page.url()).toBe(url)
    expect(
      await page.evaluate(() => (window as unknown as { events: string[] }).events),
    ).toContain('close:0')
  })

  test('closing from the UI removes the history entry it pushed', async ({ page }) => {
    await page.goto('/e2e/iife.html')
    await openAt(page, 0)
    await page.locator('.lenslite__close').click()
    await expect(root(page)).toHaveCount(0)
    // Our entry is popped, so one back press leaves the fixture page.
    await expect.poll(() => page.evaluate(() => history.state)).toBeNull()
    await page.goBack()
    await expect(page).toHaveURL(/iife\.html/)
  })

  test('reopening right after a UI close survives the late popstate', async ({
    page,
  }) => {
    await openAt(page, 0)
    const url = page.url()
    // Close and reopen in the same task, before history.back() lands.
    await page.evaluate(() => {
      const box = (window as unknown as { box: { close(): void; open(i: number): void } })
        .box
      box.close()
      box.open(1)
    })
    await page.waitForTimeout(500)
    await expect(root(page)).toBeVisible()
    await expect(counter(page)).toHaveText('2 / 3')
    // The reopened viewer owns a fresh entry: back closes it, page stays.
    await page.goBack()
    await expect(root(page)).toHaveCount(0)
    expect(page.url()).toBe(url)
  })

  test('history: false leaves the history stack alone', async ({ page }) => {
    await page.goto('/e2e/fixture.html?nohistory')
    const length = await page.evaluate(() => history.length)
    await page.locator('#grid a').first().click()
    await expect(root(page)).toBeVisible()
    expect(await page.evaluate(() => history.length)).toBe(length)
  })
})
