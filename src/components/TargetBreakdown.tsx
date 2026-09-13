import type { CalcInputs, CalcResults, Plan } from '@/lib/calc'
import { tradingDaysBind } from '@/lib/setup'
import {
  formatCurrency,
  formatPercent,
  formatRule,
  formatSignedCurrency,
  qualifyingBar,
} from '@/lib/format'

interface TargetBreakdownProps {
  inputs: CalcInputs
  results: CalcResults
  plan: Plan
  /** The payout being worked towards, for accounts with a schedule. */
  payout: { number: number; cap: number; repeats: boolean } | null
  /** Null in point-in-time mode, where days aren't logged one by one. */
  tradingDays: { logged: number; counting: number } | null
  consistencyInvalid: boolean
}

export function TargetBreakdown({
  inputs,
  results,
  plan,
  payout,
  tradingDays,
  consistencyInvalid,
}: TargetBreakdownProps) {
  const consistency = inputs.consistencyRequirement
  const netProfit = inputs.currentNetProfit
  const consistencyDriven =
    results.minimumNetProfitRequired > results.minimumTargetNetProfit

  const requiredNote = plan.raisesTarget
    ? `Planned days of ${formatCurrency(plan.dailyProfit)} can be at most ${formatPercent(consistency)} of net profit, which lifts the target from ${formatCurrency(results.minimumNetProfitRequired)}.`
    : consistencyDriven
      ? `Your ${formatCurrency(Math.abs(inputs.largestProfitDay))} day can be at most ${formatPercent(consistency)} of net profit.`
      : 'Same as the minimum target.'

  const rows: { label: string; value: string; note?: string }[] = [
    {
      label: 'Minimum target',
      value: formatCurrency(results.minimumTargetNetProfit),
      // Three things can set it, and which one did is the useful part.
      note:
        results.minimumTargetNetProfit === inputs.minimumPayout
          ? `The ${formatCurrency(inputs.minimumPayout)} minimum payout.`
          : results.minimumTargetNetProfit === inputs.profitGoal
            ? `The profit this payout asks for since the last one.`
            : `What takes your balance to the ${formatCurrency(inputs.payoutThreshold)} a max payout needs.`,
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
          : `${tradingDays.logged} trading ${tradingDays.logged === 1 ? 'day' : 'days'} since the last payout.`,
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

  if (payout) {
    rows.push({
      label: 'Max payout',
      value: formatRule(payout.cap),
      note: `The most payout ${payout.number} can withdraw${
        payout.repeats ? ', and every one after it' : ''
      }.`,
    })
  }

  // Nothing to report where the firm's minimum is one the consistency rule
  // reaches on its own.
  if (tradingDaysBind(inputs.minTradingDays, inputs.consistencyRequirement)) {
    rows.push({
      label: 'Trading days',
      value: `${Math.min(inputs.tradingDaysSoFar, inputs.minTradingDays)} of ${inputs.minTradingDays}`,
      note: [
        inputs.qualifyingDayProfit > 0
          ? `Only days making ${qualifyingBar(inputs.qualifyingDayProfit, inputs.qualifyingDayInclusive)} count${
              tradingDays && tradingDays.counting < tradingDays.logged
                ? `, so ${tradingDays.counting} of your ${tradingDays.logged} do`
                : ''
            }.`
          : null,
        results.eligibilityDaysLeft > 0
          ? `${results.eligibilityDaysLeft} more before this firm will pay out.`
          : 'The firm’s minimum is covered.',
      ]
        .filter(Boolean)
        .join(' '),
    })
  }

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
