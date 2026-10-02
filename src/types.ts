/** A 2D point in client (viewport) coordinates. */
export interface Point {
  x: number
  y: number
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

/** Discriminated union of every gesture the controller can emit. */
export type GestureEvent =
  | { type: 'tap'; point: Point }
  | { type: 'double-tap'; point: Point }
  | { type: 'pan'; point: Point; delta: Point; totalDelta: Point }
  | { type: 'pan-end'; totalDelta: Point; velocity: Point }
  | { type: 'swipe'; direction: SwipeDirection; velocity: Point }
  | { type: 'pinch'; scale: number; center: Point }
  | { type: 'pinch-end'; scale: number }
  | { type: 'cancel' }

export type GestureHandler = (event: GestureEvent) => void

export interface GestureOptions {
  /** Minimum travel in px for a release to count as a swipe. Default 30. */
  swipeThreshold?: number
  /** Minimum velocity in px/ms for a release to count as a swipe. Default 0.3. */
  swipeVelocity?: number
  /** Maximum travel in px for a release to still count as a tap. Default 10. */
  tapThreshold?: number
  /** Maximum ms between taps for a double-tap. Default 300. */
  doubleTapInterval?: number
  /** Maximum px between taps for a double-tap. Default 40. */
  doubleTapDistance?: number
}

export interface LensLiteItem {
  /** Full-size image URL. */
  src: string
  /** Responsive candidates for the full-size image (`img[srcset]`). */
  srcset?: string
  /** Layout hints accompanying `srcset` (`img[sizes]`). */
  sizes?: string
  /** Alternative text for the image. */
  alt?: string
  /** Caption shown below the image; part of the tap-toggled chrome. */
  caption?: string
}

export interface LensLiteOptions {
  items: LensLiteItem[]
  /** Wrap from last slide to first and vice versa. Default false. */
  loop?: boolean
  /** Maximum pinch/double-tap zoom scale. Default 4. */
  maxZoom?: number
  /** Scale applied by double-tap. Default 2.5. */
  doubleTapZoom?: number
  /** Dragging down further than this (px) at scale 1 dismisses. Default 100. */
  dismissThreshold?: number
  /**
   * Push a history entry on open so the browser's back button closes the
   * viewer instead of leaving the page. Default true.
   */
  history?: boolean
}

export type LensLiteEventName = 'open' | 'close' | 'change' | 'error'

export type LensLiteListener = (index: number) => void
