/**
 * The slice of a plot's days that is on screen.
 *
 * Days are plotted by position rather than by date — trading days are not
 * contiguous, and spacing them by the calendar would leave weekend-shaped holes
 * in a chart about trading. So a view is an index window: `start` is the first
 * day shown, fractional so panning is smooth rather than day-by-day, and `span`
 * is how many days fit across the plot.
 */
export interface PlotView {
  start: number
  span: number
}

/** Fewest days a zoomed-in view may show, so there is always a shape to read. */
export const MIN_SPAN = 3

/** Every day, from the first. */
export function fullView(total: number): PlotView {
  return { start: 0, span: Math.max(total, 1) }
}

/**
 * Holds a view inside the days that exist and inside the zoom limits. Every
 * gesture ends here, so no amount of flinging can scroll past the first or last
 * day, and a short ledger cannot be zoomed into fewer days than it has.
 */
export function clampView(view: PlotView, total: number): PlotView {
  const widest = Math.max(total, 1)
  const span = Math.min(Math.max(view.span, Math.min(MIN_SPAN, widest)), widest)
  const start = Math.min(Math.max(view.start, 0), widest - span)
  return { start, span }
}

export function sameView(a: PlotView, b: PlotView): boolean {
  return Math.abs(a.start - b.start) < 1e-9 && Math.abs(a.span - b.span) < 1e-9
}

/** Whether the view is showing everything, which is when the reset is moot. */
export function isFullView(view: PlotView, total: number): boolean {
  return sameView(clampView(view, total), fullView(total))
}

/**
 * Zoom about a point across the plot: `at` is 0 at its left edge and 1 at its
 * right. The day under that point stays under it, which is what makes a wheel
 * zoom feel anchored to the cursor rather than jumping to the middle.
 */
export function zoomView(
  view: PlotView,
  total: number,
  factor: number,
  at: number,
): PlotView {
  const held = view.start + at * view.span
  const span = view.span * factor
  return clampView({ start: held - at * span, span }, total)
}

/** Slide the view along by a number of days, positive being later. */
export function panView(view: PlotView, total: number, days: number): PlotView {
  return clampView({ start: view.start + days, span: view.span }, total)
}
