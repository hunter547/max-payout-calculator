import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  formatAxis,
  formatCurrency,
  formatLongDate,
  formatShortDate,
  formatSignedCurrency,
} from '@/lib/format'
import {
  MIN_SPAN,
  clampView,
  fullView,
  isFullView,
  panView,
  sameView,
  zoomView,
  type PlotView,
} from '@/lib/plotView'
import { cn } from '@/lib/utils'

export interface ChartBar {
  key: string
  date: string
  amount: number
  kind: 'recorded' | 'planned'
  /** Net profit after this day. */
  runningNet: number
  isLargest: boolean
}

interface PnlChartProps {
  bars: ChartBar[]
  cap: number
  /** Net profit the payout needs; the line the climb is aiming at. */
  target?: number
  /**
   * What the account held before any of this profit: the balance the plotted
   * net profit sits on top of. Required, because the tooltip labels its figures
   * as balances, and a default would quietly label net profit as one.
   */
  balanceBase: number
  className?: string
}

const HEIGHT = 466
const PAD = { top: 34, right: 96, bottom: 82, left: 64 }
/** The minimap under the axis: the whole ledger, with the window drawn on it. */
const RAIL = { height: 18, bottom: 10, grab: 10 }
const MIN_LABEL_SLOT = 52

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.clientWidth > 0) setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

function niceScale(min: number, max: number) {
  const raw = (max - min || 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / magnitude
  const step =
    (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) *
    magnitude
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return { lo, hi, ticks }
}

/**
 * A figure in the legend under its own marker: the dashed line and open circle
 * the plot draws that pace with, so the number is tied to the line rather than
 * left to be matched by colour.
 */
function PaceFigure({ amount, tone }: { amount: number; tone: 'plan' | 'cap' }) {
  const rule = tone === 'plan' ? 'bg-plan' : 'bg-cap'
  const ring = tone === 'plan' ? 'border-plan' : 'border-cap'
  return (
    <span className="inline-flex flex-col items-center">
      {/* Balances the mark below so the number sits in the figure's middle:
          the rest of the strip then aligns with the number, and the mark is
          still in flow, so a wrapped row makes room for it. */}
      <span aria-hidden className="mb-1 h-1.5" />
      <span>{formatCurrency(amount)}</span>
      <span aria-hidden className="mt-1 flex items-center gap-[3px]">
        <span className={cn('h-px w-2', rule)} />
        <span className={cn('size-1.5 rounded-full border bg-card', ring)} />
        <span className={cn('h-px w-2', rule)} />
      </span>
    </span>
  )
}

/**
 * The climb: cumulative profit rising towards the payout, rather than each day
 * on its own. Logged days are a solid line under a filled area; planned days
 * carry on dashed, and the target is the line they are reaching for.
 */
export function PnlChart({
  bars,
  cap,
  target = 0,
  balanceBase,
  className,
}: PnlChartProps) {
  const [ref, width] = useWidth()
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)
  // Null is "show everything", which is also what a new ledger should get: a
  // stored window would otherwise outlive the days it was framing.
  const [window_, setWindow] = useState<PlotView | null>(null)
  const [dragging, setDragging] = useState(false)

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const nets = bars.map((b) => b.runningNet)
  const total = bars.length
  // Clamped on the way out rather than on the way in, so days arriving or
  // leaving the ledger cannot strand the view outside them.
  const view = window_ ? clampView(window_, total) : fullView(total)
  const zoomable = total > MIN_SPAN
  const slot = innerW / view.span
  /** The middle of day `i`, where its marker sits. */
  const x = (i: number) => PAD.left + (i + 0.5 - view.start) * slot
  /** The boundary before day `i`, where its column starts. */
  const edge = (i: number) => PAD.left + (i - view.start) * slot
  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_SLOT / slot))
  const firstPlanned = bars.findIndex((b) => b.kind === 'planned')
  const lastRecorded = firstPlanned < 0 ? bars.length - 1 : firstPlanned - 1

  // The two paces that bound a sensible day, drawn from where the climb
  // stands now: the minimum keeps the plan on schedule, the maximum is the
  // most a day may make before it moves the target it is aiming at.
  const standsAt = lastRecorded >= 0 ? bars[lastRecorded].runningNet : 0
  const perDay = firstPlanned >= 0 ? bars[firstPlanned].amount : 0
  const zone =
    target > 0 && perDay > 0 && cap > perDay
      ? (() => {
          const anchorX = x(Math.max(lastRecorded, 0))
          // Days each pace needs to reach the payout. The minimum takes the
          // longest, so it is the day the plan ends on.
          const daysAtMin = (target - standsAt) / perDay
          const daysAtMax = (target - standsAt) / cap
          const xAt = (days: number) => anchorX + slot * days
          return {
            anchorX,
            slowX: xAt(daysAtMin),
            fastX: xAt(daysAtMax),
            // Where the cap pace stands on the plan's last day: above the
            // payout, because it got there sooner and kept going.
            overY: standsAt + cap * daysAtMin,
          }
        })()
      : null

  /** Where the cap pace stands on day `i`, counting from the last logged day. */
  const capAt = (i: number) => standsAt + cap * (i - Math.max(lastRecorded, 0))

  const { lo, hi, ticks } = niceScale(
    Math.min(0, ...nets),
    // The scale has to hold the cap pace where it ends up, or the line it
    // draws would leave the plot.
    Math.max(target, 1, zone?.overY ?? 0, ...nets) * 1.08,
  )
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH

  const line = (from: number, to: number) =>
    bars
      .slice(from, to + 1)
      .map((b, k) => `${k === 0 ? 'M' : 'L'}${x(from + k)},${y(b.runningNet)}`)
      .join(' ')

  const area =
    lastRecorded >= 0
      ? `${line(0, lastRecorded)} L${x(lastRecorded)},${y(0)} L${x(0)},${y(0)} Z`
      : ''


  const activeBar = active !== null ? bars[active] : undefined
  let tooltipStyle: CSSProperties | undefined
  if (activeBar && active !== null) {
    tooltipStyle = {
      left: Math.min(Math.max(x(active), 88), width - 88),
      // Above the corridor on a planned day, so it clears both markers.
      top:
        (zone && activeBar.kind === 'planned'
          ? y(capAt(active))
          : y(activeBar.runningNet)) - 14,
      transform: 'translate(-50%, -100%)',
    }
  }

  const recordedCount = bars.filter((b) => b.kind === 'recorded').length
  const madeSoFar = bars.reduce(
    (sum, b) => (b.kind === 'recorded' ? sum + b.amount : sum),
    0,
  )
  const progress = target > 0 ? Math.max(0, Math.min(1, madeSoFar / target)) : 0

  // --- panning and zooming --------------------------------------------------
  // A trader with two months logged needs to get in close on last week without
  // losing the payout line. The gestures read live geometry from a ref rather
  // than a render's copy of it, so a wheel spin or a drag that outruns React
  // still lands where the pointer was.
  const geom = useRef({ view, total, innerW })
  geom.current = { view, total, innerW }

  /** Applies a window, and says whether it actually moved. */
  const commit = useCallback((next: PlotView) => {
    if (sameView(geom.current.view, next)) return false
    geom.current = { ...geom.current, view: next }
    setWindow(next)
    return true
  }, [])

  const reset = useCallback(() => {
    geom.current = { ...geom.current, view: fullView(geom.current.total) }
    setWindow(null)
  }, [])

  /** Where a client x falls across the plot: 0 at its left edge, 1 at its right. */
  const across = useCallback((clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || geom.current.innerW <= 0) return 0.5
    const at = (clientX - box.left - PAD.left) / geom.current.innerW
    return Math.min(Math.max(at, 0), 1)
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const { view: now, total: days, innerW: w } = geom.current
      if (days <= MIN_SPAN || w <= 0) return
      // A trackpad's sideways swipe pans; a wheel's turn zooms.
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      const next = sideways
        ? panView(now, days, (e.deltaX / w) * now.span)
        : zoomView(now, days, Math.exp(e.deltaY * 0.002), across(e.clientX))
      // Claim the gesture only when it moves the plot, so at either extreme the
      // page goes on scrolling rather than the chart swallowing the wheel.
      if (commit(next)) e.preventDefault()
    }
    // Not React's onWheel: that listener is passive, and a passive listener
    // cannot preventDefault, so the page would scroll as well as the chart.
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [across, commit])

  const pointers = useRef(new Map<number, number>())
  const drag = useRef<{ x: number; view: PlotView } | null>(null)
  const pinch = useRef<{ gap: number; at: number; view: PlotView } | null>(null)

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (!zoomable || (e.pointerType === 'mouse' && e.button !== 0)) return
    pointers.current.set(e.pointerId, e.clientX)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const xs = [...pointers.current.values()]
    if (xs.length >= 2) {
      pinch.current = {
        gap: Math.max(Math.abs(xs[0] - xs[1]), 1),
        at: across((xs[0] + xs[1]) / 2),
        view: geom.current.view,
      }
      drag.current = null
    } else {
      drag.current = { x: e.clientX, view: geom.current.view }
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, e.clientX)
    const { total: days, innerW: w } = geom.current
    const xs = [...pointers.current.values()]
    if (pinch.current && xs.length >= 2) {
      const gap = Math.max(Math.abs(xs[0] - xs[1]), 1)
      setDragging(true)
      commit(
        zoomView(pinch.current.view, days, pinch.current.gap / gap, pinch.current.at),
      )
    } else if (drag.current && w > 0) {
      const moved = e.clientX - drag.current.x
      // A click is not a drag: nothing moves until the pointer means it.
      if (!dragging && Math.abs(moved) < 3) return
      if (!dragging) {
        setDragging(true)
        setActive(null)
      }
      commit(panView(drag.current.view, days, (-moved / w) * drag.current.view.span))
    }
  }

  function endPointer(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      drag.current = null
      setDragging(false)
      return
    }
    // A finger lifted out of a pinch: go on panning from where the other one is.
    const [held] = [...pointers.current.values()]
    drag.current = { x: held, view: geom.current.view }
  }

  function onKeyDown(e: ReactKeyboardEvent<SVGSVGElement>) {
    if (!zoomable) return
    const { view: now, total: days } = geom.current
    const step = Math.max(1, Math.round(now.span / 8))
    if (e.key === '0') {
      reset()
      e.preventDefault()
      return
    }
    const next =
      e.key === 'ArrowLeft'
        ? panView(now, days, -step)
        : e.key === 'ArrowRight'
          ? panView(now, days, step)
          : e.key === '+' || e.key === '='
            ? zoomView(now, days, 0.7, 0.5)
            : e.key === '-' || e.key === '_'
              ? zoomView(now, days, 1 / 0.7, 0.5)
              : null
    if (next && commit(next)) e.preventDefault()
  }

  // --- the minimap ----------------------------------------------------------
  // The whole ledger at a glance with the window drawn over it: it says the
  // plot can be moved, says where in the ledger you are, and is a way to move
  // it. Only worth drawing when there is more than a window's worth of days.
  const railTop = HEIGHT - RAIL.bottom - RAIL.height
  const railOf = (i: number) => PAD.left + ((i + 0.5) / total) * innerW
  const railLo = Math.min(0, ...nets)
  const railHi = Math.max(1, ...nets)
  const railY = (v: number) =>
    railTop + RAIL.height - ((v - railLo) / (railHi - railLo || 1)) * RAIL.height
  const railPath = bars
    .map((b, i) => `${i === 0 ? 'M' : 'L'}${railOf(i)},${railY(b.runningNet)}`)
    .join(' ')
  const windowLeft = PAD.left + (view.start / total) * innerW
  const windowWidth = (view.span / total) * innerW

  /** Where a client x falls along the rail, as a day index. */
  const railDay = useCallback((clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect()
    const { total: days, innerW: w } = geom.current
    if (!box || w <= 0) return 0
    const at = Math.min(Math.max((clientX - box.left - PAD.left) / w, 0), 1)
    return at * days
  }, [])

  const rail = useRef<{ mode: 'move' | 'start' | 'end'; grabbed: number } | null>(
    null,
  )

  function onRailDown(e: ReactPointerEvent<SVGRectElement>) {
    e.stopPropagation()
    if (!zoomable) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const { view: now, total: days, innerW: w } = geom.current
    const day = railDay(e.clientX)
    const perDay = w / days
    const fromStart = (day - now.start) * perDay
    const fromEnd = (day - (now.start + now.span)) * perDay
    if (Math.abs(fromStart) <= RAIL.grab) rail.current = { mode: 'start', grabbed: 0 }
    else if (Math.abs(fromEnd) <= RAIL.grab) rail.current = { mode: 'end', grabbed: 0 }
    else if (fromStart > 0 && fromEnd < 0)
      rail.current = { mode: 'move', grabbed: day - now.start }
    else {
      // A click on bare rail brings the window to it, centred.
      rail.current = { mode: 'move', grabbed: now.span / 2 }
      commit(clampView({ start: day - now.span / 2, span: now.span }, days))
    }
    setDragging(true)
    setActive(null)
  }

  function onRailMove(e: ReactPointerEvent<SVGRectElement>) {
    e.stopPropagation()
    const held = rail.current
    if (!held) return
    const { view: now, total: days } = geom.current
    const day = railDay(e.clientX)
    if (held.mode === 'move') {
      commit(clampView({ start: day - held.grabbed, span: now.span }, days))
    } else if (held.mode === 'start') {
      const end = now.start + now.span
      commit(clampView({ start: Math.min(day, end - 1), span: end - Math.min(day, end - 1) }, days))
    } else {
      commit(clampView({ start: now.start, span: Math.max(day - now.start, 1) }, days))
    }
  }

  function onRailUp(e: ReactPointerEvent<SVGRectElement>) {
    e.stopPropagation()
    rail.current = null
    setDragging(false)
  }

  const showingAll = isFullView(view, total)
  const firstShown = Math.min(total - 1, Math.max(0, Math.floor(view.start)))
  const lastShown = Math.min(total - 1, Math.ceil(view.start + view.span) - 1)

  return (
    <figure className={cn('relative m-0', className)} ref={ref}>
      {target > 0 && bars.length > 0 && (
        <div className="mb-4 px-2">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>
              <span className="font-figure font-semibold">
                {formatCurrency(madeSoFar)}
              </span>{' '}
              <span className="text-muted-foreground">
                of {formatCurrency(target)} to payout
              </span>
            </span>
            <span className="font-figure text-xs text-muted-foreground">
              {formatCurrency(Math.max(0, target - madeSoFar))} to go
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-profit"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}
      <svg
        ref={svgRef}
        width={width}
        height={HEIGHT}
        // pan-y so a finger dragging down still scrolls the page: only
        // sideways belongs to the chart.
        className={cn(
          'block touch-pan-y select-none',
          zoomable && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
        )}
        role="group"
        aria-label={
          showingAll
            ? 'Cumulative profit against the payout target, with the consistency corridor each day has to land in.'
            : `Cumulative profit against the payout target. Showing ${formatLongDate(bars[firstShown].date)} to ${formatLongDate(bars[lastShown].date)}, ${lastShown - firstShown + 1} of ${total} days.`
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={onKeyDown}
      >
        <defs>
          <linearGradient id="climb-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="text-profit" stopColor="currentColor" stopOpacity="0.34" />
            <stop offset="100%" className="text-profit" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
          <pattern id="climb-zone" width="6" height="6" patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)">
            <rect width="6" height="6" className="fill-plan" fillOpacity="0.07" />
            <line x1="0" y1="0" x2="0" y2="6" className="stroke-plan" strokeWidth="1.4"
              strokeOpacity="0.5" />
          </pattern>
          <linearGradient id="climb-plan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="text-plan" stopColor="currentColor" stopOpacity="0.20" />
            <stop offset="100%" className="text-plan" stopColor="currentColor" stopOpacity="0.01" />
          </linearGradient>
          {/* The window's edges. Days panned out of view stop here rather than
              spilling over the axis and its labels — and a clipped hit area
              takes no pointer events, so only what is shown is hoverable. */}
          <clipPath id="climb-window">
            <rect x={PAD.left} y={0} width={innerW} height={HEIGHT} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
              className="stroke-grid" strokeWidth={1} />
            <text x={PAD.left - 12} y={y(t)} dy="0.32em" textAnchor="end"
              className="fill-muted-foreground font-figure text-[11px]">
              {formatAxis(t)}
            </text>
          </g>
        ))}

        {/* The finish line, and the gap still to climb. */}
        {target > 0 && (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)}
              className="stroke-cap" strokeWidth={2} strokeDasharray="1 0" />
            <text x={width - PAD.right + 8} y={y(target)} dy="0.32em"
              className="fill-foreground text-xs font-semibold">
              Payout
            </text>
            <text x={width - PAD.right + 8} y={y(target) + 15} dy="0.32em"
              className="fill-muted-foreground font-figure text-[11px]">
              {formatCurrency(target)}
            </text>
          </g>
        )}

        <g clipPath="url(#climb-window)">
        {/* The consistency corridor: every day inside it keeps the plan on
            track without moving the target. Above it the target rises, below
            it the payout slips further out. */}
        {zone && (
          <>
            <path
              d={`M${zone.anchorX},${y(standsAt)} L${zone.fastX},${y(target)} L${zone.slowX},${y(target)} Z`}
              fill="url(#climb-zone)"
            />
            {/* The same zone above the payout, dimmed: profit the cap pace
                runs up after the target is already met. */}
            <path
              d={`M${zone.fastX},${y(target)} L${zone.slowX},${y(zone.overY)} L${zone.slowX},${y(target)} Z`}
              fill="url(#climb-zone)"
              fillOpacity={0.45}
            />
            {/* The top edge is the daily cap: a day above it moves the target.
                It keeps going past the payout, because at that pace the target
                is passed rather than met. */}
            <line
              x1={zone.anchorX} y1={y(standsAt)} x2={zone.slowX} y2={y(zone.overY)}
              className="stroke-cap" strokeWidth={1.5} strokeDasharray="5 4"
              strokeOpacity={0.5}
            />
            <line
              x1={zone.anchorX} y1={y(standsAt)} x2={zone.fastX} y2={y(target)}
              className="stroke-cap" strokeWidth={1.5} strokeDasharray="5 4"
              strokeOpacity={0.95}
            />
          </>
        )}
        {area && <path d={area} fill="url(#climb-fill)" />}
        {lastRecorded >= 0 && (
          <path d={line(0, lastRecorded)} fill="none" className="stroke-profit"
            strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {firstPlanned >= 0 && (
          <path d={line(Math.max(0, lastRecorded), bars.length - 1)} fill="none"
            className="stroke-plan" strokeWidth={2.5} strokeDasharray="7 6"
            strokeLinecap="round" strokeLinejoin="round" />
        )}

        {bars.map((b, i) => (
          <circle key={b.key} cx={x(i)} cy={y(b.runningNet)} r={active === i ? 6 : 4}
            className={cn(
              'transition-[r] duration-150',
              b.kind === 'planned' ? 'fill-card stroke-plan' : 'fill-profit stroke-card',
            )}
            strokeWidth={2} />
        ))}

        {/* Where today ends and the plan begins. */}
        {firstPlanned > 0 && (
          <g>
            <line x1={edge(firstPlanned)} x2={edge(firstPlanned)}
              y1={PAD.top - 10} y2={HEIGHT - PAD.bottom}
              className="stroke-axis" strokeWidth={1} strokeDasharray="3 4" />
            <text x={edge(firstPlanned) + 6} y={PAD.top - 14}
              className="fill-muted-foreground text-[10px] tracking-wide uppercase">
              From here
            </text>
          </g>
        )}

        {/* The cap pace day by day, each sat directly over the planned day
            below it: the same date, at the most it may make. The figures are
            left to the tooltip, which has room to say what they mean. */}
        {zone &&
          bars.map((b, i) =>
            b.kind === 'planned' ? (
              <circle key={`cap-${b.key}`} cx={x(i)} cy={y(capAt(i))}
                r={active === i ? 6 : 4}
                className="fill-card stroke-cap transition-[r] duration-150"
                strokeWidth={2} />
            ) : null,
          )}

        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)}
          className="stroke-axis" strokeWidth={1} />

        {bars.map((b, i) =>
          i % labelEvery === 0 ? (
            <text key={`x-${b.key}`} x={x(i)} y={HEIGHT - PAD.bottom + 22}
              textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {formatShortDate(b.date)}
            </text>
          ) : null,
        )}

        {bars.map((b, i) => (
          <rect key={`hit-${b.key}`} x={edge(i)} y={PAD.top} width={slot}
            height={innerH} fill="transparent" tabIndex={0}
            aria-label={`${formatLongDate(b.date)}, ${b.kind === 'planned' ? 'planned ' : ''}${formatSignedCurrency(b.amount)}, running ${formatCurrency(b.runningNet)}`}
            className="outline-none focus-visible:fill-foreground/5"
            onMouseEnter={() => !dragging && setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
        ))}
        </g>

        {/* The minimap: the whole ledger in miniature, the window lit on top of
            it, and the rest dimmed. Drag it to pan, drag an end to zoom, click
            the bare rail to jump. Hidden from assistive tech on purpose — it is
            a pointer shortcut for what the arrow keys already do on a day. */}
        {zoomable && (
          <g>
            {/* Tinted off the foreground rather than filled with a theme's
                muted colour, which on the darker themes is the card's own. */}
            <rect x={PAD.left} y={railTop} width={innerW} height={RAIL.height}
              rx={4} className="fill-foreground stroke-grid" fillOpacity={0.05}
              strokeWidth={1} />
            <path d={railPath} fill="none" strokeWidth={1.25}
              className="stroke-muted-foreground" strokeOpacity={0.6}
              strokeLinecap="round" strokeLinejoin="round" />
            {/* The window, lit rather than the rest dimmed: one filled shape on
                the rail reads faster than two shaded ones beside it. */}
            <rect x={windowLeft} y={railTop} width={windowWidth} height={RAIL.height}
              rx={4} className="fill-plan"
              // Lighter when it covers the whole rail: nothing is hidden yet,
              // so it should read as an invitation rather than a state.
              fillOpacity={showingAll ? 0.1 : 0.2} />
            <rect x={windowLeft} y={railTop} width={windowWidth} height={RAIL.height}
              rx={4} fill="none" strokeWidth={1.5} className="stroke-plan" />
            {/* The grips: what says an end can be taken hold of and dragged. */}
            {[windowLeft, windowLeft + windowWidth].map((gx, i) => (
              <g key={i}>
                <rect x={gx - 2.5} y={railTop + 2} width={5} height={RAIL.height - 4}
                  rx={2.5} className="fill-plan" />
                <line x1={gx} x2={gx} y1={railTop + 5} y2={railTop + RAIL.height - 5}
                  className="stroke-card" strokeWidth={1} strokeOpacity={0.8} />
              </g>
            ))}
            <rect x={PAD.left} y={railTop - 4} width={innerW} height={RAIL.height + 8}
              fill="transparent" aria-hidden="true"
              className={cn(dragging ? 'cursor-grabbing' : 'cursor-grab')}
              onPointerDown={onRailDown}
              onPointerMove={onRailMove}
              onPointerUp={onRailUp}
              onPointerCancel={onRailUp} />
          </g>
        )}
      </svg>

      {activeBar && tooltipStyle && (
        <div className="pointer-events-none absolute z-10 min-w-72 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"
          style={tooltipStyle}>
          <p className="text-xs text-muted-foreground">{formatLongDate(activeBar.date)}</p>
          {zone && activeBar.kind === 'planned' && active !== null ? (
            <>
              <p className="mt-0.5 text-sm font-semibold">
                Make between {formatCurrency(activeBar.amount)} and{' '}
                {formatCurrency(cap)}
              </p>
              <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-plan" />
                  <dt className="text-muted-foreground">
                    End-of-day balance at a minimum
                  </dt>
                  <dd className="ml-auto font-figure font-medium">
                    {formatCurrency(balanceBase + activeBar.runningNet)}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-cap" />
                  <dt className="text-muted-foreground">
                    End-of-day balance at the cap
                  </dt>
                  <dd className="ml-auto font-figure font-medium">
                    {formatCurrency(balanceBase + capAt(active))}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 border-t pt-2 text-xs leading-snug text-muted-foreground">
                Under the minimum and the payout slips a day further out. Over
                the cap and the target itself moves up.
              </p>
            </>
          ) : (
            <>
              <p className="font-figure text-base font-semibold">
                {formatCurrency(activeBar.runningNet)}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeBar.kind === 'planned' ? 'planned ' : ''}
                {formatSignedCurrency(activeBar.amount)} that day
              </p>
            </>
          )}
        </div>
      )}

      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-2 px-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-4 rounded bg-profit" />
          {recordedCount} day{recordedCount === 1 ? '' : 's'} logged
        </span>
        {/* Both paces are dashed in the plot, so their swatches are too — and
            each is named only when its line is actually there, which it is not
            once the target is met and no days are left to plan. */}
        {firstPlanned >= 0 && (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden
              className="h-0.5 w-4 bg-[repeating-linear-gradient(90deg,var(--plan)_0_4px,transparent_4px_7px)]" />
            Min daily profit trajectory
          </span>
        )}
        {zone && (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden
              className="h-0.5 w-4 bg-[repeating-linear-gradient(90deg,var(--cap)_0_4px,transparent_4px_7px)]" />
            Capped daily profit trajectory
          </span>
        )}
        {zone ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden
              className="size-3 rounded-[3px] border border-plan/50 bg-[repeating-linear-gradient(45deg,var(--plan)_0_1.5px,transparent_1.5px_5px)] opacity-70" />
            <span className="font-medium text-foreground">Consistency corridor</span>
            <PaceFigure amount={perDay} tone="plan" /> to{' '}
            <PaceFigure amount={cap} tone="cap" /> a day
          </span>
        ) : (
          cap > 0 && <span>Daily cap {formatCurrency(cap)}</span>
        )}
        {zoomable &&
          (showingAll ? null : (
            <button
              type="button"
              onClick={reset}
              className="ml-auto self-center rounded border px-2 py-0.5 text-xs hover:bg-muted"
            >
              Show all {total} days
            </button>
          ))}
      </p>
    </figure>
  )
}
