/**
 * jsdom does not implement PointerEvent; a MouseEvent subclass carrying
 * pointerId is all the library needs.
 */
class PointerEventShim extends MouseEvent {
  readonly pointerId: number

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
  }
}

Object.defineProperty(globalThis, 'PointerEvent', {
  value: PointerEventShim,
  writable: true,
  configurable: true,
})
