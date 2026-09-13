import { useState } from 'react'
import { AlertCircle, Lock, LockOpen } from 'lucide-react'
import { AccountPicker } from '@/components/AccountPicker'
import { FirmLogo } from '@/components/FirmLogo'
import { MoneyField, type FieldUnit } from '@/components/MoneyField'
import { ScheduleControls } from '@/components/ScheduleControls'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  accountTemplate,
  firmOf,
  hasSchedule,
  type AccountKey,
  type RuleKey,
  type Terms,
} from '@/lib/accounts'
import { formatCurrency } from '@/lib/format'
import { balanceHint } from '@/lib/setup'
import { cn } from '@/lib/utils'

const RULES: { key: RuleKey; label: string; unit: FieldUnit; hint: string }[] = [
  {
    key: 'startingBalance',
    label: 'Starting balance',
    unit: '$',
    hint: 'Where this account began, before any profit.',
  },
  {
    key: 'payoutThreshold',
    label: 'Balance for max payout',
    unit: '$',
    hint: 'Balance you need before the biggest payout can be requested, or 0 where the firm asks for profit instead. Set by the payout schedule above.',
  },
  {
    key: 'profitGoal',
    label: 'Profit goal',
    unit: '$',
    hint: 'Profit to earn since your last payout before one can be requested. 0 where the firm asks for a balance instead.',
  },
  {
    key: 'minimumPayout',
    label: 'Minimum payout',
    unit: '$',
    hint: 'Profit a payout needs even so. 0 if the firm has no minimum.',
  },
  {
    key: 'consistency',
    label: 'Consistency rule',
    unit: '%',
    hint: 'No single day can be more than this share of net profit.',
  },
  {
    key: 'minTradingDays',
    label: 'Minimum trading days',
    unit: 'days',
    hint: 'Trading days the firm needs since your last payout.',
  },
  {
    key: 'qualifyingDayProfit',
    label: 'Profit for a day to count',
    unit: '$',
    hint: 'A day has to beat this to be one of those trading days. 0 if every day traded counts.',
  },
]

export type BalanceDisplay =
  | { kind: 'input' }
  /** Worked out rather than typed: `from` says out of what. */
  | { kind: 'derived'; value: number; from: string }

interface AccountPanelProps {
  templateId: string
  onTemplateChange: (templateId: string) => void
  /** The payout schedule the account is on, and how far through it. */
  schedule: {
    terms: Terms
    payoutsSoFar: string
    payoutBuffer: string
    onChange: (patch: {
      terms?: Terms
      payoutsSoFar?: string
      payoutBuffer?: string
    }) => void
  }
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
  templateId,
  onTemplateChange,
  schedule,
  values,
  onChange,
  onRestoreRules,
  consistencyInvalid,
  balance,
  payoutTaken,
}: AccountPanelProps) {
  // Locked on every visit, so a stray keystroke can't change the account.
  const [locked, setLocked] = useState(true)
  const template = accountTemplate(templateId)
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

      {/* The firm this account belongs to, over its own settings. */}
      <FirmLogo
        firmId={firmOf(template).id}
        size="md"
        className="mt-4"
      />
      <AccountPicker
        value={templateId}
        onChange={onTemplateChange}
        disabled={locked}
        className="mt-3 w-full"
      />

      {/* Only for accounts whose payouts graduate, or that changed terms. */}
      {hasSchedule(template) && (
        <ScheduleControls
          template={template}
          terms={schedule.terms}
          payoutsSoFar={schedule.payoutsSoFar}
          payoutBuffer={schedule.payoutBuffer}
          onTermsChange={(terms) => schedule.onChange({ terms })}
          onPayoutsChange={(payoutsSoFar) => schedule.onChange({ payoutsSoFar })}
          onBufferChange={(payoutBuffer) => schedule.onChange({ payoutBuffer })}
          idPrefix="account-schedule"
          disabled={locked}
          className="mt-5"
        />
      )}

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
            hint={balanceHint(templateId)}
            value={values.balance}
            disabled={locked}
            onChange={(v) => onChange('balance', v)}
          />
        ) : (
          <div className="flex items-start justify-between gap-6 border-y py-3">
            <div className="text-sm">
              <p className="font-medium">Current balance</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                Starting balance plus {balance.from}, with no payout taken out
                of it yet.
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
