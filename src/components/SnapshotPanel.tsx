import { MoneyField } from '@/components/MoneyField'
import { isAmount } from '@/lib/ledger'
import { BALANCE_HINT, type Snapshot } from '@/lib/setup'

interface SnapshotPanelProps {
  balance: string
  snapshot: Snapshot
  onBalanceChange: (value: string) => void
  onSnapshotChange: (patch: Partial<Snapshot>) => void
}

const looksWrong = (value: string) => value !== '' && !isAmount(value)

export function SnapshotPanel({
  balance,
  snapshot,
  onBalanceChange,
  onSnapshotChange,
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

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <MoneyField
          id="snapshot-balance"
          label="Current balance"
          hint={BALANCE_HINT}
          value={balance}
          invalid={looksWrong(balance)}
          onChange={onBalanceChange}
        />
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
      </div>
    </section>
  )
}
