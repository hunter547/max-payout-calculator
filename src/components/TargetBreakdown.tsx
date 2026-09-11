import { MINIMUM_PAYOUT_FLOOR, type CalcResults } from '@/lib/calc'
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
} from '@/lib/format'
import type { LedgerSummary } from '@/lib/ledger'

interface TargetBreakdownProps {
  results: CalcResults
  summary: LedgerSummary
  /** Fraction, 0.5 = 50%. */
  consistency: number
  consistencyInvalid: boolean
}

export function TargetBreakdown({
  results,
  summary,
  consistency,
  consistencyInvalid,
}: TargetBreakdownProps) {
  const consistencyDriven =
    results.minimumNetProfitRequired > results.minimumTargetNetProfit

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
      value: formatCurrency(results.minimumNetProfitRequired),
      note: consistencyDriven
        ? `Your ${formatCurrency(summary.largestProfitDay)} day can be at most ${formatPercent(consistency)} of net profit.`
        : 'Same as the minimum target.',
    },
    {
      label: 'Net profit so far',
      value: formatSignedCurrency(summary.netProfit),
      note: `${summary.tradingDays} trading ${summary.tradingDays === 1 ? 'day' : 'days'} since the last payout.`,
    },
    {
      label: 'Still needed',
      value: formatCurrency(Math.max(0, results.remainingProfitNeeded)),
      note: results.targetMet ? 'Nothing left to make.' : undefined,
    },
    {
      label: 'Daily cap',
      value: consistencyInvalid
        ? '—'
        : formatCurrency(results.maxAllowedSingleDay),
      note: 'A bigger day raises the profit required.',
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
