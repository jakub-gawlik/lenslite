import { GestureController } from './gestures.js'
import { injectStyles } from './styles.js'
import type {
  GestureEvent,
  LensLiteEventName,
  LensLiteItem,
  LensLiteListener,
  LensLiteOptions,
  Point,
  SwipeDirection,
} from './types.js'

interface Defaults {
  loop: boolean
  maxZoom: number
  doubleTapZoom: number
  dismissThreshold: number
  history: boolean
}

const DEFAULTS: Defaults = {
  loop: false,
  maxZoom: 4,
  doubleTapZoom: 2.5,
  dismissThreshold: 100,
  history: true,
}

/** How many ms of the release velocity a pan keeps gliding after letting go. */
const GLIDE_MOMENTUM = 150
/** Duration of the slide/snap-back animation; must match the track CSS. */
const SLIDE_MS = 300
/** Fraction of the stage width a drag must cover to commit to a navigation. */
const SLIDE_FRACTION = 0.25
/** Release velocity in px/ms that commits a shorter drag to a navigation. */
const FLING_VELOCITY = 0.3
/** How much of the drag survives when pulling past the first or last slide. */
const RUBBER_BAND = 0.3

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Checked per gesture so a live OS-setting change is picked up. */
const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches

/** One of the three recycled slides: previous, current, next. */
interface Slide {
  el: HTMLDivElement
  img: HTMLImageElement
  note: HTMLDivElement
  spinner: HTMLDivElement
  /** Item index currently shown, or null for an empty edge slide. */
  index: number | null
}

/** Derive a gallery item from an anchor, an image, or a container of one. */
const itemFrom = (el: HTMLElement): LensLiteItem => {
  const inner = el.querySelector('img')
  const ownSrc = el.getAttribute('src')
  const src = el.getAttribute('href') ?? ownSrc ?? inner?.getAttribute('src')
  if (!src) {
    throw new Error(
      `LensLite.from: no image source found on <${el.tagName.toLowerCase()}>`,
    )
  }
  const item: LensLiteItem = { src }
  const alt = el.getAttribute('alt') ?? inner?.getAttribute('alt')
  if (alt != null) item.alt = alt
  // data-srcset/data-sizes describe the full-size image. The element's own
  // srcset/sizes only count when the element itself supplied the source: an
  // inner thumbnail's srcset would list the wrong files.
  const srcset =
    el.getAttribute('data-srcset') ?? (ownSrc ? el.getAttribute('srcset') : null)
  if (srcset) item.srcset = srcset
  const sizes =
    el.getAttribute('data-sizes') ?? (ownSrc ? el.getAttribute('sizes') : null)
  if (sizes) item.sizes = sizes
  const caption =
    el.getAttribute('data-caption') ?? el.querySelector('figcaption')?.textContent
  if (caption) item.caption = caption
  return item
}

/**
 * A mobile-first lenslite gallery.
 *
 * Gestures: drag or swipe left/right to navigate (with the slide following
 * the finger), swipe or drag up/down to dismiss, double-tap and pinch to
 * zoom (towards the fingers), pan while zoomed with momentum on release,
 * tap to toggle the chrome.
 * Keyboard: ArrowLeft/ArrowRight to navigate, Escape to close, Tab cycles
 * the controls without leaving the dialog. Adjacent images are preloaded.
 */
export class LensLite {
  private readonly items: readonly LensLiteItem[]
  private readonly opts: Defaults
  private readonly listeners: Record<LensLiteEventName, Set<LensLiteListener>> = {
    open: new Set(),
    close: new Set(),
    change: new Set(),
    error: new Set(),
  }

  private root: HTMLDivElement | null = null
  private stage!: HTMLDivElement
  private track!: HTMLDivElement
  private slides!: [Slide, Slide, Slide]
  private counter!: HTMLDivElement
  private caption!: HTMLDivElement
  private live!: HTMLDivElement
  private closeBtn!: HTMLButtonElement
  private gestures: GestureController | null = null
  private lastFocus: HTMLElement | null = null
  /** Whether the history entry pushed on open is still ours to pop. */
  private historyEntry = false

  private current = 0
  private scale = 1
  private offset: Point = { x: 0, y: 0 }
  /** Zoom level when the active pinch started; null outside a pinch. */
  private pinchBase: number | null = null
  /** Direction a single-finger drag locked onto; null outside a drag. */
  private panAxis: 'x' | 'y' | null = null
  /** Pending slide/snap-back animation; gestures are ignored while it runs. */
  private animTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: LensLiteOptions) {
    if (options.items.length === 0) {
      throw new Error('LensLite requires at least one item')
    }
    this.items = [...options.items]
    this.opts = {
      loop: options.loop ?? DEFAULTS.loop,
      maxZoom: options.maxZoom ?? DEFAULTS.maxZoom,
      doubleTapZoom: options.doubleTapZoom ?? DEFAULTS.doubleTapZoom,
      dismissThreshold: options.dismissThreshold ?? DEFAULTS.dismissThreshold,
      history: options.history ?? DEFAULTS.history,
    }
  }

  /**
   * Builds a gallery from elements already on the page and opens it at the
   * clicked element. Each element contributes one item: an anchor's `href`,
   * an image's `src`, or the `src` of the first image inside the element.
   */
  static from(
    selector: string,
    options: Omit<LensLiteOptions, 'items'> = {},
  ): LensLite {
    const elements = [...document.querySelectorAll<HTMLElement>(selector)]
    const box = new LensLite({ ...options, items: elements.map(itemFrom) })
    elements.forEach((el, i) => {
      el.addEventListener('click', (e) => {
        e.preventDefault()
        box.open(i)
      })
    })
    return box
  }

  get isOpen(): boolean {
    return this.root !== null
  }

  get index(): number {
    return this.current
  }

  get element(): HTMLDivElement | null {
    return this.root
  }

  /** The image in the center slide. */
  private get img(): HTMLImageElement {
    return this.slides[1].img
  }

  on(name: LensLiteEventName, listener: LensLiteListener): () => void {
    this.listeners[name].add(listener)
    return () => {
      this.listeners[name].delete(listener)
    }
  }

  open(index = 0): void {
    if (this.root) return
    injectStyles()
    this.current = clamp(index, 0, this.items.length - 1)
    this.pinchBase = null
    this.panAxis = null
    this.lastFocus = document.activeElement as HTMLElement | null
    this.root = this.build()
    document.body.appendChild(this.root)
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', this.onKeydown)
    window.addEventListener('resize', this.onResize)
    if (this.opts.history) {
      this.historyEntry = true
      history.pushState({ lenslite: true }, '')
      window.addEventListener('popstate', this.onPopstate)
    }
    this.render()
    this.announce()
    this.closeBtn.focus()
    this.emit('open')
  }

  close(): void {
    if (!this.root) return
    if (this.animTimer) {
      clearTimeout(this.animTimer)
      this.animTimer = null
    }
    this.gestures!.destroy()
    this.gestures = null
    document.removeEventListener('keydown', this.onKeydown)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('popstate', this.onPopstate)
    this.root.remove()
    this.root = null
    document.body.style.overflow = ''
    this.lastFocus?.focus()
    this.lastFocus = null
    if (this.historyEntry) {
      // Closed from the UI: take the entry pushed on open back out, so the
      // next back press leaves the page as the user expects.
      this.historyEntry = false
      history.back()
    }
    this.emit('close')
  }

  next(): void {
    const target = this.neighborIndex(1)
    if (target !== null) this.slideTo(target, 1)
  }

  prev(): void {
    const target = this.neighborIndex(-1)
    if (target !== null) this.slideTo(target, -1)
  }

  /** Close if open and drop every registered listener. */
  destroy(): void {
    this.close()
    for (const set of Object.values(this.listeners)) set.clear()
  }

  private emit(name: LensLiteEventName, index = this.current): void {
    for (const listener of this.listeners[name]) listener(index)
  }

  private build(): HTMLDivElement {
    const root = document.createElement('div')
    root.className = 'lenslite'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', 'Image gallery')

    this.stage = document.createElement('div')
    this.stage.className = 'lenslite__stage'
    this.track = document.createElement('div')
    this.track.className = 'lenslite__track'
    this.slides = [this.makeSlide(-1), this.makeSlide(0), this.makeSlide(1)]
    for (const slide of this.slides) this.track.appendChild(slide.el)
    this.stage.appendChild(this.track)
    root.appendChild(this.stage)

    this.closeBtn = this.button('close', '✕', 'Close', () => this.close())
    root.appendChild(this.closeBtn)
    this.counter = document.createElement('div')
    this.counter.className = 'lenslite__counter'
    root.appendChild(this.counter)
    this.caption = document.createElement('div')
    this.caption.className = 'lenslite__caption'
    root.appendChild(this.caption)
    this.live = document.createElement('div')
    this.live.className = 'lenslite__live'
    this.live.setAttribute('aria-live', 'polite')
    root.appendChild(this.live)

    if (this.items.length > 1) {
      root.appendChild(this.button('prev', '‹', 'Previous image', () => this.prev()))
      root.appendChild(this.button('next', '›', 'Next image', () => this.next()))
    } else {
      this.counter.hidden = true
    }

    // Attach to the stage (which spans the viewport) rather than the root,
    // so pointer events on the chrome buttons don't double as gestures.
    this.gestures = new GestureController(this.stage, this.onGesture)
    return root
  }

  private makeSlide(position: number): Slide {
    const el = document.createElement('div')
    el.className = 'lenslite__slide'
    el.style.left = `${position * 100}%`
    const img = document.createElement('img')
    img.className = 'lenslite__img'
    img.draggable = false
    const note = document.createElement('div')
    note.className = 'lenslite__error'
    note.textContent = 'Image failed to load'
    note.hidden = true
    const spinner = document.createElement('div')
    spinner.className = 'lenslite__spinner'
    spinner.hidden = true
    el.appendChild(img)
    el.appendChild(spinner)
    el.appendChild(note)
    const slide: Slide = { el, img, note, spinner, index: null }
    img.addEventListener('load', () => {
      img.classList.remove('lenslite__img--loading')
      spinner.hidden = true
    })
    img.addEventListener('error', () => {
      img.classList.remove('lenslite__img--loading')
      img.hidden = true
      note.hidden = false
      spinner.hidden = true
      this.emit('error', slide.index as number)
    })
    return slide
  }

  private button(
    kind: string,
    label: string,
    ariaLabel: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `lenslite__btn lenslite__${kind}`
    btn.textContent = label
    btn.setAttribute('aria-label', ariaLabel)
    btn.addEventListener('click', onClick)
    return btn
  }

  /**
   * The item index shown `delta` slides away from the current one, or null
   * when the gallery ends there and does not loop.
   */
  private neighborIndex(delta: number): number | null {
    const i = this.current + delta
    if (i >= 0 && i < this.items.length) return i
    if (!this.opts.loop) return null
    return (i + this.items.length) % this.items.length
  }

  /**
   * Shows `index` on a slide. Setting the same source again is skipped so a
   * recycled slide keeps its loaded (or failed) state and never refetches.
   */
  private populate(slide: Slide, index: number | null): void {
    slide.index = index
    if (index === null) {
      slide.img.hidden = true
      slide.img.removeAttribute('src')
      slide.img.removeAttribute('srcset')
      slide.img.removeAttribute('sizes')
      slide.note.hidden = true
      slide.spinner.hidden = true
      return
    }
    const item = this.items[index] as LensLiteItem
    slide.img.alt = item.alt ?? ''
    if (item.srcset == null) slide.img.removeAttribute('srcset')
    else slide.img.setAttribute('srcset', item.srcset)
    if (item.sizes == null) slide.img.removeAttribute('sizes')
    else slide.img.setAttribute('sizes', item.sizes)
    if (slide.img.getAttribute('src') === item.src) return
    slide.img.hidden = false
    slide.note.hidden = true
    slide.spinner.hidden = false
    slide.img.classList.add('lenslite__img--loading')
    slide.img.src = item.src
  }

  /**
   * Re-centers the track around the current item. Neighbor slides carry the
   * adjacent images, so they are preloaded before any navigation.
   */
  private render(): void {
    this.populate(this.slides[0], this.neighborIndex(-1))
    this.populate(this.slides[1], this.current)
    this.populate(this.slides[2], this.neighborIndex(1))
    for (const slide of this.slides) {
      slide.img.classList.remove('lenslite__img--glide')
      slide.img.style.transform = ''
    }
    this.counter.textContent = `${this.current + 1} / ${this.items.length}`
    const item = this.items[this.current] as LensLiteItem
    this.caption.textContent = item.caption ?? ''
    this.caption.hidden = item.caption == null
    this.setTrack(0, false)
    this.resetZoom()
  }

  /** Tells screen readers which image is showing, via the live region. */
  private announce(): void {
    const item = this.items[this.current] as LensLiteItem
    const position = `Image ${this.current + 1} of ${this.items.length}`
    const label = item.caption ?? item.alt
    this.live.textContent = label == null ? position : `${position}: ${label}`
  }

  /** Reorder the recycled slides after navigating one step. */
  private rotate(direction: 1 | -1): void {
    const [a, b, c] = this.slides
    this.slides = direction === 1 ? [b, c, a] : [c, a, b]
    this.slides.forEach((slide, i) => {
      slide.el.style.left = `${(i - 1) * 100}%`
    })
  }

  /** Animates the track one slide over, then re-centers around `index`. */
  private slideTo(index: number, direction: 1 | -1): void {
    if (this.animTimer) return
    this.current = index
    this.counter.textContent = `${this.current + 1} / ${this.items.length}`
    this.announce()
    this.setTrack(-direction * this.stage.clientWidth, true)
    this.animTimer = setTimeout(() => {
      this.animTimer = null
      this.rotate(direction)
      this.render()
    }, SLIDE_MS)
    this.emit('change')
  }

  private setTrack(x: number, animate: boolean): void {
    this.track.classList.toggle('lenslite__track--animating', animate)
    this.track.style.transform = `translateX(${x}px)`
  }

  private resetZoom(): void {
    this.scale = 1
    this.offset = { x: 0, y: 0 }
    this.applyTransform()
    this.root!.style.opacity = '1'
  }

  private applyTransform(): void {
    this.img.style.transform =
      `translate(${this.offset.x}px, ${this.offset.y}px) scale(${this.scale})`
  }

  /**
   * How far the image may be panned from center at the current zoom, so it
   * can never be dragged fully out of view.
   */
  private maxOffset(): Point {
    const factor = (this.scale - 1) / 2
    return {
      x: this.stage.clientWidth * factor,
      y: this.stage.clientHeight * factor,
    }
  }

  private clampOffset(): void {
    const max = this.maxOffset()
    this.offset = {
      x: clamp(this.offset.x, -max.x, max.x),
      y: clamp(this.offset.y, -max.y, max.y),
    }
  }

  private stopGlide(): void {
    this.img.classList.remove('lenslite__img--glide')
  }

  /** The back button closed us: the pushed entry is already gone. */
  private onPopstate = (): void => {
    this.historyEntry = false
    this.close()
  }

  /**
   * The viewport changed (rotation, keyboard, window resize): the pan clamp
   * and track positions are based on stage dimensions, so recompute them.
   */
  private onResize = (): void => {
    this.clampOffset()
    this.applyTransform()
    if (!this.animTimer) this.setTrack(0, false)
  }

  private onKeydown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'Escape':
        this.close()
        break
      case 'ArrowLeft':
        this.prev()
        break
      case 'ArrowRight':
        this.next()
        break
      case 'Tab':
        this.trapFocus(e)
        break
      default:
        break
    }
  }

  /** Keeps Tab cycling through the dialog's controls. */
  private trapFocus(e: KeyboardEvent): void {
    const buttons = this.root!.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons[0] as HTMLButtonElement
    const last = buttons[buttons.length - 1] as HTMLButtonElement
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    } else if (!this.root!.contains(active)) {
      e.preventDefault()
      first.focus()
    }
  }

  private onGesture = (event: GestureEvent): void => {
    if (this.animTimer) return
    switch (event.type) {
      case 'tap':
        this.root!.classList.toggle('lenslite--chrome-hidden')
        break
      case 'double-tap':
        this.toggleZoom(event.point)
        break
      case 'pan':
        this.onPan(event.delta, event.totalDelta)
        break
      case 'pan-end':
        this.onPanEnd(event.totalDelta, event.velocity)
        break
      case 'swipe':
        this.onSwipe(event.direction)
        break
      case 'pinch':
        this.onPinch(event.scale, event.center)
        break
      case 'pinch-end':
        this.onPinchEnd()
        break
      case 'cancel':
        this.onCancel()
        break
    }
  }

  private toggleZoom(point: Point): void {
    this.stopGlide()
    if (this.scale > 1) {
      this.resetZoom()
      return
    }
    this.scale = Math.min(this.opts.doubleTapZoom, this.opts.maxZoom)
    // Zoom towards the tapped point.
    this.offset = {
      x: (this.stage.clientWidth / 2 - point.x) * (this.scale - 1),
      y: (this.stage.clientHeight / 2 - point.y) * (this.scale - 1),
    }
    this.clampOffset()
    this.applyTransform()
  }

  private onPan(delta: Point, totalDelta: Point): void {
    this.stopGlide()
    if (this.scale > 1) {
      this.offset = { x: this.offset.x + delta.x, y: this.offset.y + delta.y }
      this.clampOffset()
      this.applyTransform()
      return
    }
    // At rest zoom the drag locks onto its initial direction: horizontal
    // drags the track towards a neighbor, vertical previews dismissal.
    if (this.panAxis === null) {
      this.panAxis = Math.abs(totalDelta.x) >= Math.abs(totalDelta.y) ? 'x' : 'y'
    }
    if (this.panAxis === 'x') {
      this.dragTrack(totalDelta.x)
      return
    }
    this.offset = { x: 0, y: totalDelta.y }
    this.applyTransform()
    const fade = clamp(
      1 - Math.abs(totalDelta.y) / (this.opts.dismissThreshold * 3),
      0.3,
      1,
    )
    this.root!.style.opacity = String(fade)
  }

  /** The track follows the finger, rubber-banding when nothing is there. */
  private dragTrack(dx: number): void {
    const target = this.neighborIndex(dx > 0 ? -1 : 1)
    this.setTrack(target === null ? dx * RUBBER_BAND : dx, false)
  }

  private onPanEnd(totalDelta: Point, velocity: Point): void {
    const axis = this.panAxis
    this.panAxis = null
    if (this.scale > 1) {
      this.glide(velocity)
      return
    }
    if (axis === 'x') {
      this.settleTrack(totalDelta.x, velocity.x)
      return
    }
    if (Math.abs(totalDelta.y) > this.opts.dismissThreshold) {
      this.close()
      return
    }
    this.resetZoom()
  }

  /** Navigate when the drag went far or fast enough, else snap back. */
  private settleTrack(dx: number, vx: number): void {
    const direction = dx < 0 ? 1 : -1
    const target = this.neighborIndex(direction)
    const committed =
      Math.abs(dx) > this.stage.clientWidth * SLIDE_FRACTION ||
      Math.abs(vx) > FLING_VELOCITY
    if (target !== null && committed) {
      this.slideTo(target, direction)
      return
    }
    this.setTrack(0, true)
    this.animTimer = setTimeout(() => {
      this.animTimer = null
      this.setTrack(0, false)
    }, SLIDE_MS)
  }

  /** Project the release velocity forward so a fast pan keeps gliding. */
  private glide(velocity: Point): void {
    if (prefersReducedMotion()) return
    this.offset = {
      x: this.offset.x + velocity.x * GLIDE_MOMENTUM,
      y: this.offset.y + velocity.y * GLIDE_MOMENTUM,
    }
    this.clampOffset()
    this.img.classList.add('lenslite__img--glide')
    this.applyTransform()
  }

  private onSwipe(direction: SwipeDirection): void {
    // Horizontal navigation is handled by the drag itself (settleTrack);
    // only a fast vertical flick below the dismiss distance lands here.
    if (!this.root || this.scale > 1) return
    if (direction === 'up' || direction === 'down') this.close()
  }

  private onPinch(scale: number, center: Point): void {
    this.stopGlide()
    this.pinchBase ??= this.scale
    const next = clamp(this.pinchBase * scale, 1, this.opts.maxZoom)
    // Keep the point between the fingers fixed while the scale changes.
    const ratio = next / this.scale
    const focus = {
      x: center.x - this.stage.clientWidth / 2,
      y: center.y - this.stage.clientHeight / 2,
    }
    this.offset = {
      x: focus.x * (1 - ratio) + this.offset.x * ratio,
      y: focus.y * (1 - ratio) + this.offset.y * ratio,
    }
    this.scale = next
    this.clampOffset()
    this.applyTransform()
  }

  private onPinchEnd(): void {
    this.pinchBase = null
    if (this.scale === 1) this.resetZoom()
  }

  /** The browser took the pointer (scroll, alert, …): abandon the gesture. */
  private onCancel(): void {
    this.panAxis = null
    this.pinchBase = null
    if (this.scale === 1) this.resetZoom()
    this.setTrack(0, false)
  }
}
