import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GestureController } from '../src/gestures.js'
import type { GestureEvent } from '../src/types.js'
import { cancel, down, drag, move, tap, up } from './helpers.js'

describe('GestureController', () => {
  let el: HTMLDivElement
  let events: GestureEvent[]
  let controller: GestureController

  const create = (options = {}): GestureController =>
    new GestureController(el, (e) => events.push(e), options)

  beforeEach(() => {
    vi.useFakeTimers()
    el = document.createElement('div')
    document.body.appendChild(el)
    events = []
    controller = create()
  })

  afterEach(() => {
    controller.destroy()
    el.remove()
    vi.useRealTimers()
  })

  describe('tap', () => {
    it('emits tap after the double-tap window elapses', () => {
      tap(el, 1, 100, 100)
      expect(events).toEqual([])
      vi.advanceTimersByTime(300)
      expect(events).toEqual([{ type: 'tap', point: { x: 100, y: 100 } }])
    })

    it('tolerates small movement within the tap threshold', () => {
      down(el, 1, 100, 100)
      move(el, 1, 104, 103)
      up(el, 1, 104, 103)
      vi.advanceTimersByTime(300)
      const types = events.map((e) => e.type)
      expect(types).toEqual(['pan', 'tap'])
    })

    it('emits double-tap for two quick taps at the same spot', () => {
      tap(el, 1, 100, 100)
      vi.advanceTimersByTime(100)
      tap(el, 2, 105, 102)
      expect(events).toEqual([
        { type: 'double-tap', point: { x: 105, y: 102 } },
      ])
      vi.advanceTimersByTime(1000)
      expect(events).toHaveLength(1)
    })

    it('treats two quick taps far apart as two separate taps', () => {
      tap(el, 1, 100, 100)
      vi.advanceTimersByTime(100)
      tap(el, 2, 300, 300)
      expect(events).toEqual([{ type: 'tap', point: { x: 100, y: 100 } }])
      vi.advanceTimersByTime(300)
      expect(events).toEqual([
        { type: 'tap', point: { x: 100, y: 100 } },
        { type: 'tap', point: { x: 300, y: 300 } },
      ])
    })

    it('does not emit double-tap when taps are too far apart in time', () => {
      tap(el, 1, 100, 100)
      vi.advanceTimersByTime(400)
      tap(el, 2, 100, 100)
      vi.advanceTimersByTime(300)
      expect(events).toEqual([
        { type: 'tap', point: { x: 100, y: 100 } },
        { type: 'tap', point: { x: 100, y: 100 } },
      ])
    })
  })

  describe('pan', () => {
    it('emits pan with incremental and total deltas', () => {
      down(el, 1, 100, 100)
      move(el, 1, 110, 105)
      move(el, 1, 130, 95)
      expect(events).toEqual([
        {
          type: 'pan',
          point: { x: 110, y: 105 },
          delta: { x: 10, y: 5 },
          totalDelta: { x: 10, y: 5 },
        },
        {
          type: 'pan',
          point: { x: 130, y: 95 },
          delta: { x: 20, y: -10 },
          totalDelta: { x: 30, y: -5 },
        },
      ])
    })

    it('emits pan-end with velocity on release', () => {
      down(el, 1, 100, 100)
      move(el, 1, 150, 100)
      vi.advanceTimersByTime(100)
      up(el, 1, 150, 100)
      expect(events).toContainEqual({
        type: 'pan-end',
        totalDelta: { x: 50, y: 0 },
        velocity: { x: 0.5, y: 0 },
      })
    })

    it('ignores moves and releases from untracked pointers', () => {
      move(el, 1, 50, 50)
      up(el, 1, 50, 50)
      expect(events).toEqual([])
    })
  })

  describe('swipe', () => {
    it.each([
      ['left', { x: 200, y: 100 }, { x: 80, y: 110 }],
      ['right', { x: 100, y: 100 }, { x: 220, y: 90 }],
      ['up', { x: 100, y: 300 }, { x: 110, y: 150 }],
      ['down', { x: 100, y: 100 }, { x: 90, y: 260 }],
    ] as const)('detects a fast %s swipe', (direction, from, to) => {
      drag(el, 1, from, to)
      expect(events.at(-1)).toMatchObject({ type: 'swipe', direction })
    })

    it('prefers the horizontal axis on a perfect diagonal', () => {
      drag(el, 1, { x: 0, y: 0 }, { x: 100, y: 100 })
      expect(events.at(-1)).toMatchObject({ type: 'swipe', direction: 'right' })
    })

    it('does not swipe when the movement is too slow', () => {
      down(el, 1, 100, 100)
      move(el, 1, 200, 100)
      vi.advanceTimersByTime(1000)
      up(el, 1, 200, 100)
      expect(events.map((e) => e.type)).toEqual(['pan', 'pan-end'])
    })

    it('does not swipe when the movement is too short', () => {
      drag(el, 1, { x: 100, y: 100 }, { x: 120, y: 100 })
      expect(events.map((e) => e.type)).toEqual(['pan', 'pan-end'])
    })

    it('honors custom thresholds', () => {
      controller.destroy()
      controller = create({ swipeThreshold: 5, tapThreshold: 2 })
      drag(el, 1, { x: 100, y: 100 }, { x: 110, y: 100 })
      expect(events.at(-1)).toMatchObject({ type: 'swipe', direction: 'right' })
    })
  })

  describe('pinch', () => {
    it('emits pinch with scale relative to the starting distance', () => {
      down(el, 1, 100, 100)
      down(el, 2, 200, 100)
      move(el, 2, 300, 100)
      expect(events.at(-1)).toEqual({
        type: 'pinch',
        scale: 2,
        center: { x: 200, y: 100 },
      })
      move(el, 2, 150, 100)
      expect(events.at(-1)).toEqual({
        type: 'pinch',
        scale: 0.5,
        center: { x: 125, y: 100 },
      })
    })

    it('guards against a zero starting distance', () => {
      down(el, 1, 100, 100)
      down(el, 2, 100, 100)
      move(el, 2, 103, 104)
      expect(events.at(-1)).toEqual({
        type: 'pinch',
        scale: 5,
        center: { x: 101.5, y: 102 },
      })
    })

    it('ends the whole gesture when either finger lifts', () => {
      down(el, 1, 100, 100)
      down(el, 2, 200, 100)
      move(el, 2, 300, 100)
      up(el, 1, 100, 100)
      expect(events.at(-1)).toEqual({ type: 'pinch-end', scale: 2 })
      // The remaining finger is no longer tracked.
      move(el, 2, 350, 100)
      up(el, 2, 350, 100)
      expect(events.at(-1)).toEqual({ type: 'pinch-end', scale: 2 })
    })

    it('ignores a third finger', () => {
      down(el, 1, 100, 100)
      down(el, 2, 200, 100)
      down(el, 3, 300, 300)
      move(el, 3, 400, 400)
      expect(events).toEqual([])
      move(el, 2, 300, 100)
      expect(events.at(-1)).toMatchObject({ type: 'pinch', scale: 2 })
    })
  })

  describe('cancel', () => {
    it('emits cancel and resets state on pointercancel', () => {
      down(el, 1, 100, 100)
      cancel(el, 1, 100, 100)
      move(el, 1, 200, 200)
      up(el, 1, 200, 200)
      expect(events).toEqual([{ type: 'cancel' }])
    })

    it('ignores cancel for untracked pointers', () => {
      down(el, 1, 100, 100)
      cancel(el, 99, 0, 0)
      move(el, 1, 110, 100)
      expect(events).toMatchObject([{ type: 'pan' }])
    })
  })

  describe('destroy', () => {
    it('stops listening once destroyed', () => {
      controller.destroy()
      drag(el, 1, { x: 100, y: 100 }, { x: 300, y: 100 })
      vi.advanceTimersByTime(1000)
      expect(events).toEqual([])
    })

    it('cancels a pending tap', () => {
      tap(el, 1, 100, 100)
      controller.destroy()
      vi.advanceTimersByTime(1000)
      expect(events).toEqual([])
    })
  })
})
