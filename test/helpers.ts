export function firePointer(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  x: number,
  y: number,
): void {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId, clientX: x, clientY: y, bubbles: true }),
  )
}

export const down = (t: EventTarget, id: number, x: number, y: number): void =>
  firePointer(t, 'pointerdown', id, x, y)

export const move = (t: EventTarget, id: number, x: number, y: number): void =>
  firePointer(t, 'pointermove', id, x, y)

export const up = (t: EventTarget, id: number, x: number, y: number): void =>
  firePointer(t, 'pointerup', id, x, y)

export const cancel = (t: EventTarget, id: number, x: number, y: number): void =>
  firePointer(t, 'pointercancel', id, x, y)

/** Single quick tap: down and up at the same spot. */
export function tap(t: EventTarget, id: number, x: number, y: number): void {
  down(t, id, x, y)
  up(t, id, x, y)
}

/** Quick drag: down, one move, up. Fast enough to register as a swipe. */
export function drag(
  t: EventTarget,
  id: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  down(t, id, from.x, from.y)
  move(t, id, to.x, to.y)
  up(t, id, to.x, to.y)
}
