import { describe, expect, it } from 'vitest'
import {
  MIN_SPAN,
  clampView,
  fullView,
  isFullView,
  panView,
  sameView,
  zoomView,
} from './plotView'

describe('fullView', () => {
  it('shows every day from the first', () => {
    expect(fullView(12)).toEqual({ start: 0, span: 12 })
  })

  it('never spans zero, so nothing divides by it', () => {
    expect(fullView(0).span).toBe(1)
  })
})

describe('clampView', () => {
  it('will not scroll past the last day', () => {
    expect(clampView({ start: 40, span: 5 }, 12)).toEqual({ start: 7, span: 5 })
  })

  it('will not scroll before the first day', () => {
    expect(clampView({ start: -6, span: 5 }, 12)).toEqual({ start: 0, span: 5 })
  })

  it('will not zoom in past the minimum span', () => {
    expect(clampView({ start: 0, span: 1 }, 12).span).toBe(MIN_SPAN)
  })

  it('will not zoom out past the days that exist', () => {
    expect(clampView({ start: 0, span: 99 }, 12).span).toBe(12)
  })

  it('lets a ledger shorter than the minimum span stay as it is', () => {
    // Two logged days cannot be shown three at a time.
    expect(clampView({ start: 0, span: 1 }, 2)).toEqual({ start: 0, span: 2 })
  })
})

describe('zoomView', () => {
  it('holds the day under the cursor in place', () => {
    const view = { start: 0, span: 20 }
    // Half way across the plot sits on day 10; it should still, after zooming.
    const next = zoomView(view, 40, 0.5, 0.5)
    expect(next.span).toBe(10)
    expect(next.start + 0.5 * next.span).toBeCloseTo(10)
  })

  it('holds the left edge when zooming from the left edge', () => {
    const next = zoomView({ start: 4, span: 20 }, 40, 0.5, 0)
    expect(next.start).toBeCloseTo(4)
  })

  it('holds the right edge when zooming from the right edge', () => {
    const next = zoomView({ start: 0, span: 20 }, 40, 0.5, 1)
    expect(next.start + next.span).toBeCloseTo(20)
  })

  it('clamps rather than overshooting when zooming out at an edge', () => {
    const next = zoomView({ start: 0, span: 10 }, 12, 4, 0)
    expect(next).toEqual({ start: 0, span: 12 })
  })

  it('cannot zoom in beyond the minimum span', () => {
    const next = zoomView({ start: 0, span: 4 }, 40, 0.1, 0.5)
    expect(next.span).toBe(MIN_SPAN)
  })
})

describe('panView', () => {
  it('slides later and earlier', () => {
    expect(panView({ start: 4, span: 5 }, 20, 3).start).toBe(7)
    expect(panView({ start: 4, span: 5 }, 20, -3).start).toBe(1)
  })

  it('stops at the last day rather than running off the end', () => {
    expect(panView({ start: 14, span: 5 }, 20, 10).start).toBe(15)
  })
})

describe('isFullView', () => {
  it('is true only when everything is showing', () => {
    expect(isFullView({ start: 0, span: 12 }, 12)).toBe(true)
    expect(isFullView({ start: 0, span: 6 }, 12)).toBe(false)
    expect(isFullView({ start: 6, span: 6 }, 12)).toBe(false)
  })

  it('treats an out-of-range view as the clamped one it will be drawn as', () => {
    expect(isFullView({ start: -3, span: 99 }, 12)).toBe(true)
  })
})

describe('sameView', () => {
  it('ignores floating point dust', () => {
    expect(sameView({ start: 0.1 + 0.2, span: 5 }, { start: 0.3, span: 5 })).toBe(
      true,
    )
  })
})
