import { MoneyField } from '@/components/MoneyField'
import { qualifyingBar } from '@/lib/format'
import { isAmount } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import type { Snapshot } from '@/lib/setup'

interface SnapshotPanelProps {
  snapshot: Snapshot
  onSnapshotChange: (patch: Partial<Snapshot>) => void
  /** Profit a day must beat to count, where the firm sets one. */
  qualifyingDayProfit: number
  inclusiveBar?: boolean
  /** False where the firm's minimum is one the consistency rule reaches. */
  asksTradingDays: boolean
}

const looksWrong = (value: string) => value !== '' && !isAmount(value)

/** Point-in-time numbers. Current balance lives with the account settings. */
export function SnapshotPanel({
  snapshot,
  onSnapshotChange,
  qualifyingDayProfit,
  inclusiveBar = false,
  asksTradingDays,
}: SnapshotPanelProps) {
  return (
    <section aria-labelledby="snapshot-heading" className="min-w-0">
      <h2 id="snapshot-heading" className="font-expanded text-xl font-bold">
        Your numbers
      </h2>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        Copy these from your account whenever they change. The plan above
        updates as you type.
      </p>

      <div
        className={cn(
          'mt-5 grid gap-5',
          asksTradingDays ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        <MoneyField
          id="snapshot-largest"
          label="Largest profit day"
          hint="Your best single day since the last payout."
          value={snapshot.largestProfitDay}
          invalid={looksWrong(snapshot.largestProfitDay)}
          onChange={(v) => onSnapshotChange({ largestProfitDay: v })}
        />
        <MoneyField
          id="snapshot-net"
          label="Cumulative profit"
          hint="Since the last payout. Resets to zero after each payout."
          value={snapshot.netProfit}
          invalid={looksWrong(snapshot.netProfit)}
          onChange={(v) => onSnapshotChange({ netProfit: v })}
        />
        {asksTradingDays && (
        <MoneyField
          id="snapshot-days"
          label="Trading days so far"
          unit="days"
          hint={
            qualifyingDayProfit > 0
              ? `Days since the last payout making ${qualifyingBar(qualifyingDayProfit, inclusiveBar)}; only those count.`
              : 'Days you have traded since the last payout.'
          }
          value={snapshot.tradingDays}
          invalid={looksWrong(snapshot.tradingDays)}
          onChange={(v) => onSnapshotChange({ tradingDays: v })}
        />
        )}
      </div>
    </section>
  )
}
