import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { LensLite } from '../src/index.js'
import type { LensLiteItem } from '../src/types.js'
import { cancel, down, drag, move, tap, up } from './helpers.js'

const ITEMS: LensLiteItem[] = [
  { src: 'a.jpg', alt: 'First' },
  { src: 'b.jpg', alt: 'Second' },
  { src: 'c.jpg' },
]

/** Duration of the slide/snap-back animation. */
const SLIDE_MS = 300

const slidesOf = (el: HTMLElement): HTMLElement[] =>
  [...el.querySelectorAll<HTMLElement>('.lenslite__slide')]
const centerSlide = (el: HTMLElement): HTMLElement =>
  slidesOf(el).find((s) => s.style.left === '0%') as HTMLElement
const centerImg = (el: HTMLElement): HTMLImageElement =>
  centerSlide(el).querySelector('.lenslite__img') as HTMLImageElement
const imgsOf = (el: HTMLElement): HTMLImageElement[] =>
  [...el.querySelectorAll<HTMLImageElement>('.lenslite__img')]

describe('LensLite', () => {
  let box: LensLite
  /** jsdom's history traversal is async; stubbed out to stay deterministic. */
  let backSpy: MockInstance

  beforeEach(() => {
    vi.useFakeTimers()
    backSpy = vi.spyOn(history, 'back').mockImplementation(() => {})
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    box = new LensLite({ items: ITEMS })
  })

  afterEach(() => {
    box.destroy()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const root = (): HTMLDivElement => box.element as HTMLDivElement
  const img = (): HTMLImageElement => centerImg(root())
  const errorNote = (): HTMLElement =>
    centerSlide(root()).querySelector('.lenslite__error') as HTMLElement
  const spinner = (): HTMLElement =>
    centerSlide(root()).querySelector('.lenslite__spinner') as HTMLElement
  const track = (): HTMLElement =>
    root().querySelector('.lenslite__track') as HTMLElement
  const settle = (): void => {
    vi.advanceTimersByTime(SLIDE_MS)
  }

  /** The stage with mocked layout, since jsdom computes no sizes. */
  const stage = (): HTMLElement => {
    const el = root().querySelector('.lenslite__stage') as HTMLElement
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    return el
  }

  describe('construction', () => {
    it('throws when given no items', () => {
      expect(() => new LensLite({ items: [] })).toThrow(
        'LensLite requires at least one item',
      )
    })
  })

  describe('open and close', () => {
    it('renders a dialog with the requested image', () => {
      box.open(1)
      expect(box.isOpen).toBe(true)
      expect(box.index).toBe(1)
      expect(root().getAttribute('role')).toBe('dialog')
      expect(img().src).toContain('b.jpg')
      expect(img().alt).toBe('Second')
      expect(root().querySelector('.lenslite__counter')?.textContent).toBe('2 / 3')
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('defaults to the first image and clamps out-of-range indexes', () => {
      box.open()
      expect(box.index).toBe(0)
      box.close()
      box.open(-5)
      expect(box.index).toBe(0)
      box.close()
      box.open(99)
      expect(box.index).toBe(2)
    })

    it('is a no-op when already open', () => {
      box.open(0)
      box.open(2)
      expect(box.index).toBe(0)
      expect(document.querySelectorAll('.lenslite')).toHaveLength(1)
    })

    it('injects its stylesheet exactly once across reopens', () => {
      box.open()
      box.close()
      box.open()
      expect(document.head.querySelectorAll('style[data-lenslite]')).toHaveLength(1)
    })

    it('close removes the dialog and restores scrolling', () => {
      box.open()
      box.close()
      expect(box.isOpen).toBe(false)
      expect(box.element).toBeNull()
      expect(document.querySelector('.lenslite')).toBeNull()
      expect(document.body.style.overflow).toBe('')
    })

    it('close is a no-op when not open', () => {
      expect(() => box.close()).not.toThrow()
    })

    it('uses an empty alt when the item has none', () => {
      box.open(2)
      expect(img().alt).toBe('')
    })

    it('marks the image as loading and spins until it loads', () => {
      box.open()
      expect(img().classList.contains('lenslite__img--loading')).toBe(true)
      expect(spinner().hidden).toBe(false)
      img().dispatchEvent(new Event('load'))
      expect(img().classList.contains('lenslite__img--loading')).toBe(false)
      expect(spinner().hidden).toBe(true)
    })

    it('hides the counter and nav buttons for a single item', () => {
      const single = new LensLite({ items: [{ src: 'only.jpg' }] })
      single.open()
      const el = single.element as HTMLDivElement
      expect(el.querySelector('.lenslite__prev')).toBeNull()
      expect(el.querySelector('.lenslite__next')).toBeNull()
      expect((el.querySelector('.lenslite__counter') as HTMLElement).hidden).toBe(true)
      single.destroy()
    })
  })

  describe('preloading', () => {
    it('preloads the adjacent images on the neighbor slides', () => {
      box.open(1)
      expect(imgsOf(root()).map((i) => i.getAttribute('src'))).toEqual([
        'a.jpg',
        'b.jpg',
        'c.jpg',
      ])
    })

    it('leaves edge slides empty when not looping', () => {
      box.open(0)
      const imgs = imgsOf(root())
      expect(imgs[0]!.hidden).toBe(true)
      expect(imgs[0]!.getAttribute('src')).toBeNull()
      const edgeSpinner = imgs[0]!.parentElement!.querySelector(
        '.lenslite__spinner',
      ) as HTMLElement
      expect(edgeSpinner.hidden).toBe(true)
      expect(imgs[1]!.getAttribute('src')).toBe('a.jpg')
      expect(imgs[2]!.getAttribute('src')).toBe('b.jpg')
    })

    it('preloads across the loop boundary', () => {
      const looping = new LensLite({ items: ITEMS, loop: true })
      looping.open(0)
      expect(imgsOf(looping.element as HTMLElement).map((i) => i.getAttribute('src'))).toEqual([
        'c.jpg',
        'a.jpg',
        'b.jpg',
      ])
      looping.destroy()
    })
  })

  describe('loading errors', () => {
    it('shows an error state and emits error when the image fails to load', () => {
      const onError = vi.fn()
      box.on('error', onError)
      box.open(1)
      img().dispatchEvent(new Event('error'))
      expect(img().hidden).toBe(true)
      expect(img().classList.contains('lenslite__img--loading')).toBe(false)
      expect(spinner().hidden).toBe(true)
      expect(errorNote().hidden).toBe(false)
      expect(errorNote().textContent).toBe('Image failed to load')
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(1)
    })

    it('emits error with the index of a failed neighbor preload', () => {
      const onError = vi.fn()
      box.on('error', onError)
      box.open(0)
      imgsOf(root())[2]!.dispatchEvent(new Event('error'))
      expect(onError).toHaveBeenCalledWith(1)
    })

    it('shows a fresh slide after navigating away from a failed image', () => {
      box.open(0)
      img().dispatchEvent(new Event('error'))
      box.next()
      settle()
      expect(img().hidden).toBe(false)
      expect(errorNote().hidden).toBe(true)
      expect(img().classList.contains('lenslite__img--loading')).toBe(true)
    })
  })

  describe('navigation', () => {
    it('steps forward and backward within bounds', () => {
      box.open(0)
      box.next()
      settle()
      expect(box.index).toBe(1)
      box.prev()
      settle()
      expect(box.index).toBe(0)
      box.prev()
      expect(box.index).toBe(0)
      box.close()
      box.open(2)
      box.next()
      expect(box.index).toBe(2)
    })

    it('wraps around when loop is enabled', () => {
      const looping = new LensLite({ items: ITEMS, loop: true })
      looping.open(2)
      looping.next()
      expect(looping.index).toBe(0)
      vi.advanceTimersByTime(SLIDE_MS)
      looping.prev()
      expect(looping.index).toBe(2)
      looping.destroy()
    })

    it('updates the counter immediately and the image after the slide', () => {
      box.open(0)
      box.next()
      expect(root().querySelector('.lenslite__counter')?.textContent).toBe('2 / 3')
      settle()
      expect(img().src).toContain('b.jpg')
    })

    it('ignores further navigation while a slide animation runs', () => {
      box.open(0)
      box.next()
      expect(box.index).toBe(1)
      box.next()
      expect(box.index).toBe(1)
      settle()
      box.next()
      expect(box.index).toBe(2)
      settle()
      expect(img().getAttribute('src')).toBe('c.jpg')
    })

    it('navigates and closes via the chrome buttons', () => {
      box.open(0)
      ;(root().querySelector('.lenslite__next') as HTMLButtonElement).click()
      expect(box.index).toBe(1)
      settle()
      ;(root().querySelector('.lenslite__prev') as HTMLButtonElement).click()
      expect(box.index).toBe(0)
      settle()
      ;(root().querySelector('.lenslite__close') as HTMLButtonElement).click()
      expect(box.isOpen).toBe(false)
    })
  })

  describe('keyboard', () => {
    const press = (key: string): void => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }))
    }

    it('navigates with arrows and closes with Escape', () => {
      box.open(0)
      press('ArrowRight')
      expect(box.index).toBe(1)
      settle()
      press('ArrowLeft')
      expect(box.index).toBe(0)
      settle()
      press('a')
      expect(box.index).toBe(0)
      press('Escape')
      expect(box.isOpen).toBe(false)
    })

    it('stops listening after close', () => {
      box.open(0)
      box.close()
      press('ArrowRight')
      box.open(0)
      expect(box.index).toBe(0)
    })
  })

  describe('focus management', () => {
    const pressTab = (shiftKey = false): KeyboardEvent => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })
      document.dispatchEvent(e)
      return e
    }

    it('moves focus to the close button on open and restores it on close', () => {
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      outside.focus()
      box.open()
      expect(document.activeElement).toBe(root().querySelector('.lenslite__close'))
      box.close()
      expect(document.activeElement).toBe(outside)
    })

    it('wraps Tab from the last control to the first', () => {
      box.open()
      const buttons = root().querySelectorAll('button')
      ;(buttons[buttons.length - 1] as HTMLElement).focus()
      const e = pressTab()
      expect(e.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(buttons[0])
    })

    it('wraps Shift+Tab from the first control to the last', () => {
      box.open()
      const buttons = root().querySelectorAll('button')
      const e = pressTab(true)
      expect(e.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(buttons[buttons.length - 1])
    })

    it('pulls focus back into the dialog when it escapes', () => {
      const outside = document.createElement('button')
      document.body.appendChild(outside)
      box.open()
      outside.focus()
      const e = pressTab()
      expect(e.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(root().querySelector('.lenslite__close'))
    })

    it('lets Tab move naturally between the controls', () => {
      box.open()
      const buttons = root().querySelectorAll('button')
      ;(buttons[1] as HTMLElement).focus()
      expect(pressTab().defaultPrevented).toBe(false)
      expect(pressTab(true).defaultPrevented).toBe(false)
    })

    it('tolerates nothing being focused before opening', () => {
      Object.defineProperty(document, 'activeElement', {
        value: null,
        configurable: true,
      })
      box.open()
      expect(() => box.close()).not.toThrow()
      delete (document as unknown as Record<string, unknown>).activeElement
    })
  })

  describe('events', () => {
    it('emits open, change and close with the current index', () => {
      const log: string[] = []
      box.on('open', (i) => log.push(`open:${i}`))
      box.on('change', (i) => log.push(`change:${i}`))
      box.on('close', (i) => log.push(`close:${i}`))
      box.open(1)
      box.next()
      box.close()
      expect(log).toEqual(['open:1', 'change:2', 'close:2'])
    })

    it('supports unsubscribing', () => {
      const listener = vi.fn()
      const off = box.on('open', listener)
      off()
      box.open()
      expect(listener).not.toHaveBeenCalled()
    })

    it('destroy closes and drops all listeners', () => {
      const listener = vi.fn()
      box.on('close', listener)
      box.open()
      box.destroy()
      expect(listener).toHaveBeenCalledTimes(1)
      box.open()
      box.close()
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('gestures', () => {
    it('toggles the chrome on tap', () => {
      box.open()
      const s = stage()
      tap(s, 1, 200, 300)
      vi.advanceTimersByTime(300)
      expect(root().classList.contains('lenslite--chrome-hidden')).toBe(true)
      tap(s, 1, 200, 300)
      vi.advanceTimersByTime(300)
      expect(root().classList.contains('lenslite--chrome-hidden')).toBe(false)
    })

    it('navigates on quick horizontal drags', () => {
      box.open(1)
      const s = stage()
      drag(s, 1, { x: 300, y: 300 }, { x: 100, y: 300 })
      expect(box.index).toBe(2)
      settle()
      drag(s, 1, { x: 100, y: 300 }, { x: 300, y: 300 })
      expect(box.index).toBe(1)
    })

    it('follows a slow horizontal drag and commits past a quarter of the width', () => {
      box.open(1)
      const s = stage()
      down(s, 1, 300, 300)
      move(s, 1, 240, 300)
      move(s, 1, 180, 300)
      expect(track().style.transform).toBe('translateX(-120px)')
      expect(track().classList.contains('lenslite__track--animating')).toBe(false)
      vi.advanceTimersByTime(1000)
      up(s, 1, 180, 300)
      expect(box.index).toBe(2)
      expect(track().classList.contains('lenslite__track--animating')).toBe(true)
      expect(track().style.transform).toBe('translateX(-400px)')
      expect(img().getAttribute('src')).toBe('b.jpg')
      settle()
      expect(track().classList.contains('lenslite__track--animating')).toBe(false)
      expect(track().style.transform).toBe('translateX(0px)')
      expect(img().getAttribute('src')).toBe('c.jpg')
    })

    it('snaps back when a slow horizontal drag falls short', () => {
      box.open(1)
      const s = stage()
      down(s, 1, 300, 300)
      move(s, 1, 220, 300)
      vi.advanceTimersByTime(1000)
      up(s, 1, 220, 300)
      expect(box.index).toBe(1)
      expect(track().classList.contains('lenslite__track--animating')).toBe(true)
      expect(track().style.transform).toBe('translateX(0px)')
      settle()
      expect(track().classList.contains('lenslite__track--animating')).toBe(false)
      expect(img().getAttribute('src')).toBe('b.jpg')
    })

    it('commits a short but fast flick', () => {
      box.open(0)
      const s = stage()
      down(s, 1, 200, 300)
      move(s, 1, 150, 300)
      vi.advanceTimersByTime(100)
      up(s, 1, 150, 300)
      expect(box.index).toBe(1)
      settle()
      expect(img().getAttribute('src')).toBe('b.jpg')
    })

    it('rubber-bands when dragging past the end of the gallery', () => {
      box.open(0)
      const s = stage()
      down(s, 1, 100, 300)
      move(s, 1, 250, 300)
      expect(track().style.transform).toBe('translateX(45px)')
      vi.advanceTimersByTime(1000)
      up(s, 1, 250, 300)
      expect(box.index).toBe(0)
      expect(track().classList.contains('lenslite__track--animating')).toBe(true)
      expect(track().style.transform).toBe('translateX(0px)')
      settle()
      expect(box.isOpen).toBe(true)
    })

    it('does not navigate on a sideways release of a vertical drag', () => {
      box.open(1)
      const s = stage()
      down(s, 1, 100, 300)
      move(s, 1, 100, 340)
      move(s, 1, 300, 340)
      up(s, 1, 300, 340)
      expect(box.index).toBe(1)
      expect(box.isOpen).toBe(true)
    })

    it('closes on a quick vertical swipe', () => {
      box.open()
      const s = stage()
      drag(s, 1, { x: 200, y: 300 }, { x: 200, y: 360 })
      expect(box.isOpen).toBe(false)
    })

    it('closes on a quick upward swipe too', () => {
      box.open()
      const s = stage()
      drag(s, 1, { x: 200, y: 240 }, { x: 200, y: 180 })
      expect(box.isOpen).toBe(false)
    })

    it('honors custom zoom and dismiss options', () => {
      const custom = new LensLite({
        items: ITEMS,
        maxZoom: 3,
        doubleTapZoom: 5,
        dismissThreshold: 50,
      })
      custom.open()
      const el = (custom.element as HTMLDivElement).querySelector(
        '.lenslite__stage',
      ) as HTMLElement
      Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true })
      Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
      tap(el, 1, 200, 300)
      tap(el, 1, 200, 300)
      // doubleTapZoom is capped by maxZoom.
      expect(centerImg(custom.element as HTMLElement).style.transform).toBe(
        'translate(0px, 0px) scale(3)',
      )
      custom.destroy()

      const dismissive = new LensLite({ items: ITEMS, dismissThreshold: 50 })
      dismissive.open()
      const s2 = (dismissive.element as HTMLDivElement).querySelector(
        '.lenslite__stage',
      ) as HTMLElement
      down(s2, 1, 200, 100)
      move(s2, 1, 200, 160)
      vi.advanceTimersByTime(1000)
      up(s2, 1, 200, 160)
      expect(dismissive.isOpen).toBe(false)
      dismissive.destroy()
    })

    it('zooms in towards a double-tapped point and back out', () => {
      box.open()
      const s = stage()
      tap(s, 1, 100, 300)
      tap(s, 1, 100, 300)
      expect(img().style.transform).toBe('translate(150px, 0px) scale(2.5)')
      tap(s, 1, 100, 300)
      tap(s, 1, 100, 300)
      expect(img().style.transform).toBe('translate(0px, 0px) scale(1)')
    })

    it('pans the image while zoomed, clamped to the frame', () => {
      box.open()
      const s = stage()
      tap(s, 1, 200, 300)
      tap(s, 1, 200, 300)
      expect(img().style.transform).toBe('translate(0px, 0px) scale(2.5)')
      down(s, 1, 200, 300)
      move(s, 1, 150, 250)
      expect(img().style.transform).toBe('translate(-50px, -50px) scale(2.5)')
      move(s, 1, 900, 300)
      // Max offset at scale 2.5 is 300px horizontally, 450px vertically.
      expect(img().style.transform).toBe('translate(300px, 0px) scale(2.5)')
      up(s, 1, 900, 300)
      // The release glides, but the offset is already at the clamp.
      expect(img().style.transform).toBe('translate(300px, 0px) scale(2.5)')
      expect(box.isOpen).toBe(true)
    })

    it('glides with momentum after a pan while zoomed', () => {
      box.open()
      const s = stage()
      tap(s, 1, 200, 300)
      tap(s, 1, 200, 300)
      down(s, 2, 200, 300)
      move(s, 2, 150, 300)
      vi.advanceTimersByTime(100)
      // Released at 0.5 px/ms: the image keeps gliding 150ms worth, so a
      // further 75px past the 50px already panned.
      up(s, 2, 150, 300)
      expect(img().classList.contains('lenslite__img--glide')).toBe(true)
      expect(img().style.transform).toBe('translate(-125px, 0px) scale(2.5)')
      // The next touch interrupts the glide.
      down(s, 3, 200, 300)
      move(s, 3, 210, 300)
      expect(img().classList.contains('lenslite__img--glide')).toBe(false)
      expect(img().style.transform).toBe('translate(-115px, 0px) scale(2.5)')
      up(s, 3, 210, 300)
    })

    it('ignores swipes while zoomed', () => {
      box.open(1)
      const s = stage()
      tap(s, 1, 200, 300)
      tap(s, 1, 200, 300)
      drag(s, 1, { x: 300, y: 300 }, { x: 100, y: 300 })
      expect(box.index).toBe(1)
      expect(box.isOpen).toBe(true)
    })

    it('previews dismissal on a vertical drag and snaps back below the threshold', () => {
      box.open()
      const s = stage()
      down(s, 1, 200, 300)
      move(s, 1, 200, 330)
      move(s, 1, 200, 350)
      expect(img().style.transform).toBe('translate(0px, 50px) scale(1)')
      expect(root().style.opacity).toBe(String(1 - 50 / 300))
      vi.advanceTimersByTime(1000)
      up(s, 1, 200, 350)
      expect(box.isOpen).toBe(true)
      expect(img().style.transform).toBe('translate(0px, 0px) scale(1)')
      expect(root().style.opacity).toBe('1')
    })

    it('dismisses when dragged beyond the threshold, even slowly', () => {
      box.open()
      const s = stage()
      down(s, 1, 200, 100)
      move(s, 1, 200, 500)
      expect(root().style.opacity).toBe('0.3')
      vi.advanceTimersByTime(1000)
      up(s, 1, 200, 500)
      expect(box.isOpen).toBe(false)
    })

    it('handles a fast long drag down: dismissal wins over the swipe', () => {
      box.open()
      const s = stage()
      drag(s, 1, { x: 200, y: 100 }, { x: 200, y: 300 })
      expect(box.isOpen).toBe(false)
    })

    it('zooms with a pinch towards the pinch center, clamped to maxZoom', () => {
      box.open()
      const s = stage()
      down(s, 1, 150, 300)
      down(s, 2, 250, 300)
      // Scale 1 → 2; the pinch center (250, 300) sits 50px right of the
      // stage center, so the image shifts left to keep it under the fingers.
      move(s, 2, 350, 300)
      expect(img().style.transform).toBe('translate(-50px, 0px) scale(2)')
      // Scale would be 10 but clamps to 4; center is now (650, 300).
      move(s, 2, 1150, 300)
      expect(img().style.transform).toBe('translate(-550px, 0px) scale(4)')
      up(s, 1, 150, 300)
      expect(img().style.transform).toBe('translate(-550px, 0px) scale(4)')
      expect(box.isOpen).toBe(true)
    })

    it('never pinches below scale 1 and resets cleanly', () => {
      box.open()
      const s = stage()
      down(s, 1, 100, 300)
      down(s, 2, 300, 300)
      move(s, 2, 150, 300)
      expect(img().style.transform).toBe('translate(0px, 0px) scale(1)')
      up(s, 1, 100, 300)
      expect(img().style.transform).toBe('translate(0px, 0px) scale(1)')
    })

    it('continues a pan after pinch-zooming', () => {
      box.open()
      const s = stage()
      down(s, 1, 150, 300)
      down(s, 2, 250, 300)
      move(s, 2, 350, 300)
      up(s, 1, 150, 300)
      down(s, 3, 200, 300)
      move(s, 3, 180, 300)
      expect(img().style.transform).toBe('translate(-70px, 0px) scale(2)')
      up(s, 3, 180, 300)
    })

    it('abandons a dismissal drag on pointer cancel', () => {
      box.open()
      const s = stage()
      down(s, 1, 200, 300)
      move(s, 1, 200, 380)
      expect(root().style.opacity).not.toBe('1')
      cancel(s, 1, 200, 380)
      expect(img().style.transform).toBe('translate(0px, 0px) scale(1)')
      expect(root().style.opacity).toBe('1')
    })

    it('keeps the zoom level on pointer cancel while zoomed', () => {
      box.open()
      const s = stage()
      tap(s, 1, 200, 300)
      tap(s, 1, 200, 300)
      down(s, 2, 200, 300)
      move(s, 2, 150, 300)
      cancel(s, 2, 150, 300)
      expect(img().style.transform).toBe('translate(-50px, 0px) scale(2.5)')
    })
  })

  describe('captions and srcset', () => {
    const CAPTIONED: LensLiteItem[] = [
      { src: 'a.jpg', alt: 'First', caption: 'A sunrise' },
      { src: 'b.jpg', srcset: 'b-1x.jpg 1x, b-2x.jpg 2x', sizes: '100vw' },
      { src: 'c.jpg' },
    ]
    let rich: LensLite

    beforeEach(() => {
      rich = new LensLite({ items: CAPTIONED })
    })

    afterEach(() => {
      rich.destroy()
    })

    const el = (): HTMLDivElement => rich.element as HTMLDivElement
    const captionOf = (): HTMLElement =>
      el().querySelector('.lenslite__caption') as HTMLElement
    const liveOf = (): HTMLElement =>
      el().querySelector('.lenslite__live') as HTMLElement

    it('shows the caption for the current item and hides it otherwise', () => {
      rich.open(0)
      expect(captionOf().hidden).toBe(false)
      expect(captionOf().textContent).toBe('A sunrise')
      rich.next()
      settle()
      expect(captionOf().hidden).toBe(true)
      expect(captionOf().textContent).toBe('')
    })

    it('applies srcset and sizes from the item and leaves others bare', () => {
      rich.open(1)
      const [left, center, right] = imgsOf(el())
      expect(center!.getAttribute('srcset')).toBe('b-1x.jpg 1x, b-2x.jpg 2x')
      expect(center!.getAttribute('sizes')).toBe('100vw')
      expect(left!.getAttribute('srcset')).toBeNull()
      expect(right!.getAttribute('sizes')).toBeNull()
    })

    it('announces the image with its caption via the live region', () => {
      rich.open(0)
      expect(liveOf().getAttribute('aria-live')).toBe('polite')
      expect(liveOf().textContent).toBe('Image 1 of 3: A sunrise')
    })

    it('falls back to alt text, then to the bare position, announcing as soon as navigation starts', () => {
      box.open(1)
      const live = root().querySelector('.lenslite__live') as HTMLElement
      expect(live.textContent).toBe('Image 2 of 3: Second')
      box.next()
      expect(live.textContent).toBe('Image 3 of 3')
    })
  })

  describe('history integration', () => {
    it('pushes a history entry on open and closes when the user navigates back', () => {
      const push = vi.spyOn(history, 'pushState')
      box.open()
      expect(push).toHaveBeenCalledWith({ lenslite: true }, '')
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(box.isOpen).toBe(false)
      expect(backSpy).not.toHaveBeenCalled()
    })

    it('pops its history entry when closed from the UI', () => {
      box.open()
      box.close()
      expect(backSpy).toHaveBeenCalledTimes(1)
      // The popstate listener is gone: a later back press is not ours.
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(box.isOpen).toBe(false)
      expect(backSpy).toHaveBeenCalledTimes(1)
    })

    it('can be turned off with the history option', () => {
      const push = vi.spyOn(history, 'pushState')
      const plain = new LensLite({ items: ITEMS, history: false })
      plain.open()
      window.dispatchEvent(new PopStateEvent('popstate'))
      expect(plain.isOpen).toBe(true)
      plain.close()
      expect(push).not.toHaveBeenCalled()
      expect(backSpy).not.toHaveBeenCalled()
      plain.destroy()
    })
  })

  describe('viewport resize', () => {
    it('re-clamps the zoomed pan to the new stage size', () => {
      box.open()
      const s = stage()
      tap(s, 1, 200, 300)
      tap(s, 1, 200, 300)
      down(s, 2, 200, 300)
      move(s, 2, 600, 300)
      expect(img().style.transform).toBe('translate(300px, 0px) scale(2.5)')
      // Rotating to a narrower viewport halves the horizontal play.
      Object.defineProperty(s, 'clientWidth', { value: 200, configurable: true })
      window.dispatchEvent(new Event('resize'))
      expect(img().style.transform).toBe('translate(150px, 0px) scale(2.5)')
      expect(track().style.transform).toBe('translateX(0px)')
      vi.advanceTimersByTime(1000)
      up(s, 2, 600, 300)
    })

    it('does not disturb a running slide animation', () => {
      box.open(0)
      stage()
      box.next()
      expect(track().style.transform).toBe('translateX(-400px)')
      window.dispatchEvent(new Event('resize'))
      expect(track().style.transform).toBe('translateX(-400px)')
      settle()
      expect(box.index).toBe(1)
    })

    it('stops listening after close', () => {
      box.open()
      stage()
      box.close()
      expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow()
    })
  })

  describe('reduced motion', () => {
    it('skips glide momentum when the user prefers reduced motion', () => {
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
      box.open()
      const s = stage()
      tap(s, 1, 200, 300)
      tap(s, 1, 200, 300)
      down(s, 2, 200, 300)
      move(s, 2, 150, 300)
      vi.advanceTimersByTime(100)
      up(s, 2, 150, 300)
      expect(img().classList.contains('lenslite__img--glide')).toBe(false)
      expect(img().style.transform).toBe('translate(-50px, 0px) scale(2.5)')
    })

    it('glides normally when matchMedia is unavailable', () => {
      vi.stubGlobal('matchMedia', undefined)
      box.open()
      const s = stage()
      tap(s, 1, 200, 300)
      tap(s, 1, 200, 300)
      down(s, 2, 200, 300)
      move(s, 2, 150, 300)
      vi.advanceTimersByTime(100)
      up(s, 2, 150, 300)
      expect(img().classList.contains('lenslite__img--glide')).toBe(true)
      expect(img().style.transform).toBe('translate(-125px, 0px) scale(2.5)')
    })
  })

  describe('LensLite.from', () => {
    it('derives captions, srcset and sizes from attributes', () => {
      document.body.innerHTML = `
        <a class="g" href="big-1.jpg" data-caption="Cap one"
           data-srcset="big-1.jpg 1x, big-1@2x.jpg 2x" data-sizes="100vw">
          <img src="t1.jpg" srcset="t1-2x.jpg 2x">
        </a>
        <img class="g" src="x.jpg" srcset="x-2x.jpg 2x" sizes="50vw" alt="X">
        <figure class="g">
          <img src="f.jpg" srcset="f-2x.jpg 2x">
          <figcaption>Fig cap</figcaption>
        </figure>
      `
      const gallery = LensLite.from('.g')
      gallery.open(0)
      const el = gallery.element as HTMLElement
      const captionEl = el.querySelector('.lenslite__caption') as HTMLElement
      expect(centerImg(el).getAttribute('srcset')).toBe(
        'big-1.jpg 1x, big-1@2x.jpg 2x',
      )
      expect(centerImg(el).getAttribute('sizes')).toBe('100vw')
      expect(captionEl.textContent).toBe('Cap one')
      gallery.next()
      vi.advanceTimersByTime(SLIDE_MS)
      // A bare image carries its own srcset and sizes along.
      expect(centerImg(el).getAttribute('srcset')).toBe('x-2x.jpg 2x')
      expect(centerImg(el).getAttribute('sizes')).toBe('50vw')
      expect(captionEl.hidden).toBe(true)
      gallery.next()
      vi.advanceTimersByTime(SLIDE_MS)
      // An inner thumbnail's srcset never leaks; figcaption becomes the caption.
      expect(centerImg(el).getAttribute('srcset')).toBeNull()
      expect(captionEl.textContent).toBe('Fig cap')
      gallery.destroy()
    })

    it('builds a gallery from anchors and opens at the clicked one', () => {
      document.body.innerHTML = `
        <a href="big-1.jpg"><img src="thumb-1.jpg" alt="One"></a>
        <a href="big-2.jpg"><img src="thumb-2.jpg" alt="Two"></a>
        <a href="big-3.jpg">plain link</a>
      `
      const gallery = LensLite.from('a')
      const click = new MouseEvent('click', { bubbles: true, cancelable: true })
      document.querySelectorAll('a')[1]!.dispatchEvent(click)
      expect(click.defaultPrevented).toBe(true)
      expect(gallery.isOpen).toBe(true)
      expect(gallery.index).toBe(1)
      const current = centerImg(gallery.element as HTMLElement)
      expect(current.getAttribute('src')).toBe('big-2.jpg')
      expect(current.alt).toBe('Two')
      gallery.next()
      vi.advanceTimersByTime(SLIDE_MS)
      // The third anchor holds no image, so its item has no alt text.
      expect(centerImg(gallery.element as HTMLElement).alt).toBe('')
      gallery.destroy()
    })

    it('builds items from bare images', () => {
      document.body.innerHTML = '<img class="pic" src="x.jpg" alt="X">'
      const gallery = LensLite.from('.pic')
      document.querySelector('.pic')!.dispatchEvent(new MouseEvent('click'))
      expect(gallery.isOpen).toBe(true)
      const current = centerImg(gallery.element as HTMLElement)
      expect(current.getAttribute('src')).toBe('x.jpg')
      expect(current.alt).toBe('X')
      gallery.destroy()
    })

    it('builds items from containers holding an image', () => {
      document.body.innerHTML = '<figure><img src="f.jpg" alt="F"></figure>'
      const gallery = LensLite.from('figure')
      document.querySelector('figure')!.dispatchEvent(new MouseEvent('click'))
      expect(centerImg(gallery.element as HTMLElement).getAttribute('src')).toBe('f.jpg')
      gallery.destroy()
    })

    it('passes options through', () => {
      document.body.innerHTML = `
        <a href="big-1.jpg">one</a>
        <a href="big-2.jpg">two</a>
      `
      const gallery = LensLite.from('a', { loop: true })
      gallery.open(1)
      gallery.next()
      expect(gallery.index).toBe(0)
      vi.advanceTimersByTime(SLIDE_MS)
      gallery.destroy()
    })

    it('throws when an element has no image source', () => {
      document.body.innerHTML = '<div class="bad"></div>'
      expect(() => LensLite.from('.bad')).toThrow(
        'LensLite.from: no image source found on <div>',
      )
    })

    it('throws when nothing matches the selector', () => {
      expect(() => LensLite.from('.nothing-here')).toThrow(
        'LensLite requires at least one item',
      )
    })
  })
})
