import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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
  /** Largest allowed single day. 0 hides the ceiling. */
  cap: number
  className?: string
}

const HEIGHT = 300
const PAD = { top: 32, right: 16, bottom: 36, left: 64 }
const MAX_BAR_WIDTH = 24
const CORNER = 4
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

/** Round the value range out to clean ticks: 0 / 100 / 200 … */
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
  for (let v = lo; v <= hi + step / 2; v += step) {
    ticks.push(Number(v.toFixed(6)))
  }
  return { lo, hi, ticks }
}

/** A column with a 4px rounded data end and a square foot on the baseline. */
function barPath(x: number, w: number, base: number, end: number): string {
  const h = Math.abs(end - base)
  if (h < 1) return `M${x},${base - 0.5}h${w}v1h${-w}Z`
  const r = Math.min(CORNER, h, w / 2)
  const dir = end < base ? 1 : -1 // 1 = grows up, -1 = grows down
  return [
    `M${x},${base}`,
    `V${end + dir * r}`,
    `Q${x},${end} ${x + r},${end}`,
    `H${x + w - r}`,
    `Q${x + w},${end} ${x + w},${end + dir * r}`,
    `V${base}`,
    'Z',
  ].join(' ')
}

function LegendKey({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={cn('size-3 rounded-[3px]', swatch)} />
      {children}
    </span>
  )
}

export function PnlChart({ bars, cap, className }: PnlChartProps) {
  const [ref, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)

  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const amounts = bars.map((b) => b.amount)
  const { lo, hi, ticks } = niceScale(
    Math.min(0, ...amounts),
    Math.max(cap, 1, ...amounts) * 1.06,
  )
  const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * innerH
  const slot = bars.length > 0 ? innerW / bars.length : innerW
  const barW = Math.max(4, Math.min(MAX_BAR_WIDTH, slot * 0.56))
  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_SLOT / slot))
  const firstPlanned = bars.findIndex((b) => b.kind === 'planned')

  const hasProfit = bars.some((b) => b.kind === 'recorded' && b.amount > 0)
  const hasLoss = bars.some((b) => b.kind === 'recorded' && b.amount < 0)
  const recordedCount = bars.filter((b) => b.kind === 'recorded').length
  const plannedCount = bars.length - recordedCount

  const activeBar = active !== null ? bars[active] : undefined

  // Sit the tooltip above the bar when there's room; tall bars near the cap
  // get it beside them instead, so it never runs off the top of the plate.
  let tooltipStyle: CSSProperties | undefined
  if (activeBar && active !== null) {
    const tipWidth = 176
    const tipHeight = 76
    const cx = PAD.left + slot * (active + 0.5)
    const anchor = y(Math.max(activeBar.amount, 0)) - 12
    if (anchor > tipHeight) {
      tooltipStyle = {
        left: Math.min(Math.max(cx, tipWidth / 2), width - tipWidth / 2),
        top: anchor,
        transform: 'translate(-50%, -100%)',
      }
    } else if (cx + barW / 2 + 10 + tipWidth <= width) {
      tooltipStyle = { left: cx + barW / 2 + 10, top: PAD.top }
    } else {
      tooltipStyle = {
        left: cx - barW / 2 - 10,
        top: PAD.top,
        transform: 'translateX(-100%)',
      }
    }
  }

  return (
    <figure className={cn('m-0', className)}>
      <div ref={ref} className="relative w-full">
        {bars.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: HEIGHT }}
          >
            Your daily P&L will chart here once you add a day.
          </div>
        ) : (
          <svg
            width={width}
            height={HEIGHT}
            role="group"
            aria-label={`Daily profit and loss: ${recordedCount} recorded, ${plannedCount} planned${cap > 0 ? `, daily cap ${formatCurrency(cap)}` : ''}.`}
            className="block"
          >
            {firstPlanned >= 0 && (
              <rect
                x={PAD.left + slot * firstPlanned}
                y={PAD.top - 12}
                width={slot * (bars.length - firstPlanned)}
                height={innerH + 12}
                className="fill-plan/[0.07]"
              />
            )}

            {ticks.map((t) => (
              <g key={t}>
                {Math.abs(t) > 1e-9 && (
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(t)}
                    y2={y(t)}
                    className="stroke-grid"
                    strokeWidth={1}
                  />
                )}
                <text
                  x={PAD.left - 12}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground font-figure text-[11px]"
                >
                  {formatAxis(t)}
                </text>
              </g>
            ))}

            {bars.map((b, i) => (
              <path
                key={b.key}
                d={barPath(
                  PAD.left + slot * i + (slot - barW) / 2,
                  barW,
                  y(0),
                  y(b.amount),
                )}
                strokeWidth={b.kind === 'planned' ? 1.5 : 0}
                className={cn(
                  'transition-opacity duration-150',
                  b.kind === 'planned'
                    ? 'fill-plan/15 stroke-plan'
                    : b.amount >= 0
                      ? 'fill-profit'
                      : 'fill-loss',
                  active !== null && active !== i && 'opacity-40',
                )}
              />
            ))}

            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(0)}
              y2={y(0)}
              className="stroke-axis"
              strokeWidth={1}
            />

            {cap > 0 && (
              <g>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(cap)}
                  y2={y(cap)}
                  className="stroke-cap"
                  strokeWidth={2}
                />
                <text
                  x={width - PAD.right}
                  y={y(cap) - 8}
                  textAnchor="end"
                  className="fill-foreground text-xs font-semibold"
                >
                  Daily cap {formatCurrency(cap)}
                </text>
              </g>
            )}

            {bars.map((b, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={`x-${b.key}`}
                  x={PAD.left + slot * (i + 0.5)}
                  y={HEIGHT - PAD.bottom + 22}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {formatShortDate(b.date)}
                </text>
              ) : null,
            )}

            {bars.map((b, i) => (
              <rect
                key={`hit-${b.key}`}
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${formatLongDate(b.date)}, ${b.kind === 'planned' ? 'planned ' : ''}${formatSignedCurrency(b.amount)}`}
                className="outline-none focus-visible:fill-foreground/5"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            ))}
          </svg>
        )}

        {activeBar && tooltipStyle && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"
            style={tooltipStyle}
          >
            <p className="text-xs text-muted-foreground">
              {formatLongDate(activeBar.date)}
            </p>
            <p className="font-figure text-base font-semibold">
              {formatSignedCurrency(activeBar.amount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {activeBar.kind === 'planned'
                ? 'Planned day'
                : activeBar.isLargest
                  ? 'Largest day'
                  : 'Recorded day'}
              , net {formatCurrency(activeBar.runningNet)}
            </p>
          </div>
        )}
      </div>

      {bars.length > 0 && (
        <figcaption className="mt-3 flex flex-wrap gap-x-6 gap-y-2 pl-1 text-sm text-muted-foreground">
          {hasProfit && <LegendKey swatch="bg-profit">Profit day</LegendKey>}
          {hasLoss && <LegendKey swatch="bg-loss">Loss day</LegendKey>}
          {plannedCount > 0 && (
            <LegendKey swatch="border-[1.5px] border-plan bg-plan/15">
              Planned day
            </LegendKey>
          )}
          {cap > 0 && (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="h-0.5 w-4 bg-cap" />
              Daily cap
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
