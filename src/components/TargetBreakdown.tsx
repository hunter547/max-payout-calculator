import { MINIMUM_PAYOUT_FLOOR, type CalcResults, type Plan } from '@/lib/calc'
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from '@/lib/format'

interface TargetBreakdownProps {
  results: CalcResults
  plan: Plan
  largestProfitDay: number
  netProfit: number
  /** Null in point-in-time mode, where days aren't logged. */
  tradingDays: number | null
  /** Fraction, 0.5 = 50%. */
  consistency: number
  consistencyInvalid: boolean
}

export function TargetBreakdown({
  results,
  plan,
  largestProfitDay,
  netProfit,
  tradingDays,
  consistency,
  consistencyInvalid,
}: TargetBreakdownProps) {
  const consistencyDriven =
    results.minimumNetProfitRequired > results.minimumTargetNetProfit

  const requiredNote = plan.raisesTarget
    ? `Planned days of ${formatCurrency(plan.dailyProfit)} can be at most ${formatPercent(consistency)} of net profit, which lifts the target from ${formatCurrency(results.minimumNetProfitRequired)}.`
    : consistencyDriven
      ? `Your ${formatCurrency(Math.abs(largestProfitDay))} day can be at most ${formatPercent(consistency)} of net profit.`
      : 'Same as the minimum target.'

  const rows: { label: string; value: string; note?: string }[] = [
    {
      label: 'Minimum target',
      value: formatCurrency(results.minimumTargetNetProfit),
      note:
        results.minimumTargetNetProfit === MINIMUM_PAYOUT_FLOOR
          ? `The ${formatCurrency(MINIMUM_PAYOUT_FLOOR)} minimum payout.`
          : 'Payout buffer plus cap, less your balance.',
    },
    {
      label: 'Profit required',
      value: formatCurrency(plan.requiredProfit),
      note: requiredNote,
    },
    {
      label: 'Net profit so far',
      value: formatSignedCurrency(netProfit),
      note:
        tradingDays === null
          ? 'Since the last payout.'
          : `${tradingDays} trading ${tradingDays === 1 ? 'day' : 'days'} since the last payout.`,
    },
    {
      label: 'Still needed',
      value: formatCurrency(Math.max(0, plan.requiredProfit - netProfit)),
      note: results.targetMet ? 'Nothing left to make.' : undefined,
    },
    {
      label: 'Daily cap',
      value: consistencyInvalid ? '—' : formatCurrency(plan.dailyCap),
      note: plan.customCap
        ? 'Your curated cap.'
        : plan.raisesTarget
          ? 'Set by your planned days, the new largest day.'
          : 'A bigger day raises the profit required.',
    },
  ]

  return (
    <section aria-labelledby="breakdown-heading">
      <h2 id="breakdown-heading" className="font-expanded text-xl font-bold">
        How the target is set
      </h2>
      <dl className="mt-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-6 border-t py-3"
          >
            <dt className="text-sm">
              <span className="font-medium">{row.label}</span>
              {row.note && (
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {row.note}
                </span>
              )}
            </dt>
            <dd className="font-figure text-lg font-semibold whitespace-nowrap">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
