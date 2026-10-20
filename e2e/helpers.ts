import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

export interface Point {
  x: number
  y: number
}

/** Duration of the slide/snap-back animation. */
export const SLIDE_MS = 300

export const root = (page: Page): Locator => page.locator('.lenslite')
export const stage = (page: Page): Locator => page.locator('.lenslite__stage')
export const counter = (page: Page): Locator => page.locator('.lenslite__counter')
export const caption = (page: Page): Locator => page.locator('.lenslite__caption')

/** The image on the slide currently in view. */
export const centerImg = (page: Page): Locator =>
  page.locator('.lenslite__slide[style*="left: 0%"] .lenslite__img')

/** Opens the fixture gallery by clicking the `index`-th thumbnail. */
export async function openAt(page: Page, index: number, query = ''): Promise<void> {
  await page.goto(`/e2e/fixture.html${query}`)
  await page.locator('#grid a').nth(index).click()
  await expect(root(page)).toBeVisible()
  await expect(centerImg(page)).not.toHaveClass(/lenslite__img--loading/)
}

export async function stageSize(page: Page): Promise<{ width: number; height: number }> {
  return stage(page).evaluate((el) => ({
    width: el.clientWidth,
    height: el.clientHeight,
  }))
}

/** Pan offset and scale of the center image, parsed from its inline transform. */
export async function imgTransform(
  page: Page,
): Promise<{ x: number; y: number; scale: number }> {
  const transform = await centerImg(page).evaluate((el) => el.style.transform)
  // WebKit serializes translate(0px, 0px) as translate(0px).
  const match = /translate\((\S+)px(?:, (\S+)px)?\) scale\((\S+)\)/.exec(transform)
  if (!match) throw new Error(`unexpected transform: ${transform}`)
  return { x: Number(match[1]), y: Number(match[2] ?? 0), scale: Number(match[3]) }
}

/**
 * Dispatches a synthetic touch PointerEvent on the stage. Playwright has no
 * cross-browser multi-touch input, so pinches (and drags on touch devices)
 * go through here; layout, timing and event handling are still the real
 * browser's.
 */
async function touch(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  { x, y }: Point,
): Promise<void> {
  await stage(page).evaluate(
    (el, init) => {
      el.dispatchEvent(
        new PointerEvent(init.type, {
          pointerId: init.pointerId,
          pointerType: 'touch',
          isPrimary: init.pointerId === 1,
          clientX: init.x,
          clientY: init.y,
          bubbles: true,
          cancelable: true,
        }),
      )
    },
    { type, pointerId, x, y },
  )
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/**
 * One-finger drag from `from` to `to` in `steps` moves, spread over roughly
 * `duration` ms (a long duration keeps the release velocity below the flick
 * threshold). Uses the real mouse on desktop and touch pointers on touch
 * devices.
 */
export async function drag(
  page: Page,
  from: Point,
  to: Point,
  { steps = 8, duration = 0 }: { steps?: number; duration?: number } = {},
): Promise<void> {
  const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
  const pause = duration / steps
  if (isTouch) await touch(page, 'pointerdown', 1, from)
  else {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
  }
  for (let i = 1; i <= steps; i++) {
    if (pause) await page.waitForTimeout(pause)
    const point = lerp(from, to, i / steps)
    if (isTouch) await touch(page, 'pointermove', 1, point)
    else await page.mouse.move(point.x, point.y)
  }
  if (isTouch) await touch(page, 'pointerup', 1, to)
  else await page.mouse.up()
}

/** Two-finger pinch around `center`, from `startGap` to `endGap` px apart. */
export async function pinch(
  page: Page,
  center: Point,
  startGap: number,
  endGap: number,
  steps = 6,
): Promise<void> {
  const fingers = (gap: number): [Point, Point] => [
    { x: center.x - gap / 2, y: center.y },
    { x: center.x + gap / 2, y: center.y },
  ]
  const [a0, b0] = fingers(startGap)
  await touch(page, 'pointerdown', 1, a0)
  await touch(page, 'pointerdown', 2, b0)
  let last = fingers(startGap)
  for (let i = 1; i <= steps; i++) {
    last = fingers(startGap + ((endGap - startGap) * i) / steps)
    await touch(page, 'pointermove', 1, last[0])
    await touch(page, 'pointermove', 2, last[1])
  }
  await touch(page, 'pointerup', 1, last[0])
  await touch(page, 'pointerup', 2, last[1])
}

/** A real double-tap: the touchscreen on touch devices, the mouse elsewhere. */
export async function doubleTap(page: Page, { x, y }: Point): Promise<void> {
  const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0)
  if (isTouch) {
    await page.touchscreen.tap(x, y)
    await page.touchscreen.tap(x, y)
  } else {
    await page.mouse.click(x, y)
    await page.mouse.click(x, y)
  }
}
