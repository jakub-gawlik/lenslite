import type {
  GestureEvent,
  GestureHandler,
  GestureOptions,
  Point,
  SwipeDirection,
} from './types.js'

interface PointerState {
  id: number
  start: Point
  last: Point
  startTime: number
}

interface PinchState {
  a: PointerState
  b: PointerState
  startDist: number
  lastScale: number
}

interface PendingTap {
  point: Point
  timer: ReturnType<typeof setTimeout>
}

const DEFAULTS: Required<GestureOptions> = {
  swipeThreshold: 30,
  swipeVelocity: 0.3,
  tapThreshold: 10,
  doubleTapInterval: 300,
  doubleTapDistance: 40,
}

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y)

/**
 * Translates raw Pointer Events on a target element into high-level gesture
 * events: tap, double-tap, pan, pan-end, swipe, pinch, pinch-end and cancel.
 *
 * Listeners stay on the target element, so the target is expected to cover
 * the whole interactive area (the lenslite overlay spans the viewport).
 * A single tap is emitted after `doubleTapInterval` elapses, so it never
 * fires for the first half of a double-tap.
 */
export class GestureController {
  private readonly opts: Required<GestureOptions>
  private readonly pointers = new Map<number, PointerState>()
  private pinch: PinchState | null = null
  private pendingTap: PendingTap | null = null

  constructor(
    private readonly target: HTMLElement,
    private readonly handler: GestureHandler,
    options: GestureOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options }
    target.addEventListener('pointerdown', this.onDown)
    target.addEventListener('pointermove', this.onMove)
    target.addEventListener('pointerup', this.onUp)
    target.addEventListener('pointercancel', this.onCancel)
  }

  destroy(): void {
    this.target.removeEventListener('pointerdown', this.onDown)
    this.target.removeEventListener('pointermove', this.onMove)
    this.target.removeEventListener('pointerup', this.onUp)
    this.target.removeEventListener('pointercancel', this.onCancel)
    if (this.pendingTap) clearTimeout(this.pendingTap.timer)
    this.pendingTap = null
    this.reset()
  }

  private reset(): void {
    this.pointers.clear()
    this.pinch = null
  }

  private emit(event: GestureEvent): void {
    this.handler(event)
  }

  private onDown = (e: PointerEvent): void => {
    // Only the first two pointers participate; further fingers are ignored.
    if (this.pointers.size >= 2) return
    const point = { x: e.clientX, y: e.clientY }
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      start: point,
      last: { ...point },
      startTime: Date.now(),
    })
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [PointerState, PointerState]
      this.pinch = {
        a,
        b,
        startDist: Math.max(1, distance(a.last, b.last)),
        lastScale: 1,
      }
    }
  }

  private onMove = (e: PointerEvent): void => {
    const state = this.pointers.get(e.pointerId)
    if (!state) return
    const point = { x: e.clientX, y: e.clientY }
    const delta = { x: point.x - state.last.x, y: point.y - state.last.y }
    state.last = point
    if (this.pinch) {
      const { a, b } = this.pinch
      const scale = distance(a.last, b.last) / this.pinch.startDist
      this.pinch.lastScale = scale
      this.emit({
        type: 'pinch',
        scale,
        center: { x: (a.last.x + b.last.x) / 2, y: (a.last.y + b.last.y) / 2 },
      })
      return
    }
    this.emit({
      type: 'pan',
      point,
      delta,
      totalDelta: { x: point.x - state.start.x, y: point.y - state.start.y },
    })
  }

  private onUp = (e: PointerEvent): void => {
    const state = this.pointers.get(e.pointerId)
    if (!state) return
    if (this.pinch) {
      // Lifting either finger ends the whole two-finger gesture.
      this.emit({ type: 'pinch-end', scale: this.pinch.lastScale })
      this.reset()
      return
    }
    this.pointers.delete(e.pointerId)
    const totalDelta = {
      x: state.last.x - state.start.x,
      y: state.last.y - state.start.y,
    }
    const travelled = Math.hypot(totalDelta.x, totalDelta.y)
    const duration = Math.max(1, Date.now() - state.startTime)
    if (travelled <= this.opts.tapThreshold) {
      this.handleTap(state.last)
      return
    }
    const velocity = { x: totalDelta.x / duration, y: totalDelta.y / duration }
    this.emit({ type: 'pan-end', totalDelta, velocity })
    const direction = this.detectSwipe(totalDelta, velocity)
    if (direction) this.emit({ type: 'swipe', direction, velocity })
  }

  private onCancel = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return
    this.reset()
    this.emit({ type: 'cancel' })
  }

  private handleTap(point: Point): void {
    const pending = this.pendingTap
    if (pending) {
      clearTimeout(pending.timer)
      this.pendingTap = null
      if (distance(point, pending.point) <= this.opts.doubleTapDistance) {
        this.emit({ type: 'double-tap', point })
        return
      }
      // Second tap landed too far away: release the first one immediately
      // and let the new tap start its own double-tap window.
      this.emit({ type: 'tap', point: pending.point })
    }
    const timer = setTimeout(() => {
      this.pendingTap = null
      this.emit({ type: 'tap', point })
    }, this.opts.doubleTapInterval)
    this.pendingTap = { point, timer }
  }

  private detectSwipe(totalDelta: Point, velocity: Point): SwipeDirection | null {
    const horizontal = Math.abs(totalDelta.x) >= Math.abs(totalDelta.y)
    const travel = Math.abs(horizontal ? totalDelta.x : totalDelta.y)
    const speed = Math.abs(horizontal ? velocity.x : velocity.y)
    if (travel < this.opts.swipeThreshold || speed < this.opts.swipeVelocity) {
      return null
    }
    if (horizontal) return totalDelta.x < 0 ? 'left' : 'right'
    return totalDelta.y < 0 ? 'up' : 'down'
  }
}
