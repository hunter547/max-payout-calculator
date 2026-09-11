import { useState } from 'react'
import { AlertCircle, Lock, LockOpen } from 'lucide-react'
import { MoneyField } from '@/components/MoneyField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatCurrency } from '@/lib/format'
import { BALANCE_HINT } from '@/lib/setup'
import { cn } from '@/lib/utils'

export type AccountKey = 'balance' | 'payoutBuffer' | 'payoutCap' | 'consistency'

const RULES: {
  key: Exclude<AccountKey, 'balance'>
  label: string
  unit: '$' | '%'
  hint: string
}[] = [
  {
    key: 'payoutBuffer',
    label: 'Payout buffer',
    unit: '$',
    hint: 'Has to stay in the account after a withdrawal.',
  },
  {
    key: 'payoutCap',
    label: 'Payout cap',
    unit: '$',
    hint: 'Most you can take out in one request.',
  },
  {
    key: 'consistency',
    label: 'Consistency rule',
    unit: '%',
    hint: 'No single day can be more than this share of net profit.',
  },
]

export type BalanceDisplay =
  | { kind: 'input' }
  | { kind: 'derived'; value: number }

interface AccountPanelProps {
  values: Record<AccountKey, string>
  onChange: (key: AccountKey, value: string) => void
  onRestoreRules: () => void
  consistencyInvalid: boolean
  /** An input, or worked out from logged days. */
  balance: BalanceDisplay
  /** Day-by-day only: switches the balance between entered and derived. */
  payoutTaken?: { checked: boolean; onChange: (checked: boolean) => void }
}

export function AccountPanel({
  values,
  onChange,
  onRestoreRules,
  consistencyInvalid,
  balance,
  payoutTaken,
}: AccountPanelProps) {
  // Locked on every visit, so a stray keystroke can't change the account.
  const [locked, setLocked] = useState(true)
  const lockLabel = locked ? 'Unlock account settings' : 'Lock account settings'

  return (
    <section aria-labelledby="account-heading">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <h2 id="account-heading" className="font-expanded text-xl font-bold">
            Account
          </h2>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Outlined so it reads as a button; blue while unlocked. */}
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={lockLabel}
                onClick={() => setLocked((l) => !l)}
                className={cn(
                  'ml-1',
                  !locked && 'border-primary text-primary dark:border-primary',
                )}
              >
                {locked ? <Lock /> : <LockOpen />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {locked ? 'Unlock to edit' : 'Lock these settings'}
            </TooltipContent>
          </Tooltip>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRestoreRules}
          disabled={locked}
        >
          Restore defaults
        </Button>
      </div>

      <div className="mt-4 grid gap-4">
        {payoutTaken && (
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="payout-taken">I’ve taken a payout</Label>
              <p className="text-xs leading-snug text-muted-foreground">
                {payoutTaken.checked
                  ? 'Enter your current balance below.'
                  : 'Your balance is worked out from your logged days.'}
              </p>
            </div>
            <Switch
              id="payout-taken"
              checked={payoutTaken.checked}
              onCheckedChange={payoutTaken.onChange}
            />
          </div>
        )}

        {balance.kind === 'input' ? (
          <MoneyField
            id="account-balance"
            label="Current balance"
            hint={BALANCE_HINT}
            value={values.balance}
            disabled={locked}
            onChange={(v) => onChange('balance', v)}
          />
        ) : (
          <div className="flex items-start justify-between gap-6 border-y py-3">
            <div className="text-sm">
              <p className="font-medium">Current balance</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Sum of your logged days.
              </p>
            </div>
            <p className="font-figure text-lg font-semibold whitespace-nowrap">
              {formatCurrency(balance.value)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {RULES.map((rule) => (
          <MoneyField
            key={rule.key}
            id={`account-${rule.key}`}
            label={rule.label}
            unit={rule.unit}
            hint={rule.hint}
            value={values[rule.key]}
            disabled={locked}
            invalid={rule.key === 'consistency' && consistencyInvalid}
            onChange={(v) => onChange(rule.key, v)}
          />
        ))}
      </div>

      {consistencyInvalid && (
        <Alert variant="destructive" className="mt-5">
          <AlertCircle />
          <AlertDescription>
            Set the consistency rule above 0%. The daily cap and the number of
            trading days both depend on it.
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}
