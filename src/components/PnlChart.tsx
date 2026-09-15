import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  formatAxis,
  formatCurrency,
  formatLongDate,
  formatShortDate,
  formatSignedCurrency,
} from '@/lib/format'
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
   * net profit sits on top of. Without it a day's figures are profit only.
   */
  balanceBase?: number
  className?: string
}

const HEIGHT = 436
const PAD = { top: 34, right: 96, bottom: 52, left: 64 }
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
  balanceBase = 0,
  className,
}: PnlChartProps) {
  const [ref, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const nets = bars.map((b) => b.runningNet)
  const slot = bars.length > 0 ? innerW / bars.length : innerW
  const x = (i: number) => PAD.left + slot * (i + 0.5)
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
      <svg width={width} height={HEIGHT} className="block" role="group"
        aria-label="Cumulative profit against the payout target, with the consistency corridor each day has to land in.">
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
              'transition-all duration-150',
              b.kind === 'planned' ? 'fill-card stroke-plan' : 'fill-profit stroke-card',
            )}
            strokeWidth={2} />
        ))}

        {/* Where today ends and the plan begins. */}
        {firstPlanned > 0 && (
          <g>
            <line x1={PAD.left + slot * firstPlanned} x2={PAD.left + slot * firstPlanned}
              y1={PAD.top - 10} y2={HEIGHT - PAD.bottom}
              className="stroke-axis" strokeWidth={1} strokeDasharray="3 4" />
            <text x={PAD.left + slot * firstPlanned + 6} y={PAD.top - 14}
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
                className="fill-card stroke-cap transition-all duration-150"
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
          <rect key={`hit-${b.key}`} x={PAD.left + slot * i} y={PAD.top} width={slot}
            height={innerH} fill="transparent" tabIndex={0}
            aria-label={`${formatLongDate(b.date)}, ${b.kind === 'planned' ? 'planned ' : ''}${formatSignedCurrency(b.amount)}, running ${formatCurrency(b.runningNet)}`}
            className="outline-none focus-visible:fill-foreground/5"
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)} onBlur={() => setActive(null)} />
        ))}
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
        {/* Both paces are dashed in the plot, so their swatches are too. */}
        <span className="inline-flex items-center gap-2">
          <span aria-hidden
            className="h-0.5 w-4 bg-[repeating-linear-gradient(90deg,var(--plan)_0_4px,transparent_4px_7px)]" />
          Min daily profit trajectory
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden
            className="h-0.5 w-4 bg-[repeating-linear-gradient(90deg,var(--cap)_0_4px,transparent_4px_7px)]" />
          Capped daily profit trajectory
        </span>
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
      </p>
    </figure>
  )
}
