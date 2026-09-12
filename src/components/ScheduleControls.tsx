import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { MoneyField } from '@/components/MoneyField'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  consistencyFor,
  drawdownRoomAt,
  firmOf,
  nextPayoutNumber,
  payoutCap,
  payoutThreshold,
  profitGoal,
  programOf,
  roomIsThin,
  scheduleFor,
  type AccountTemplate,
  type Era,
} from '@/lib/accounts'
import { formatPercent, formatRule } from '@/lib/format'
import { parseAmount } from '@/lib/ledger'
import { cn } from '@/lib/utils'

interface ScheduleControlsProps {
  template: AccountTemplate
  era: Era
  /** As typed, so a half-finished number doesn't jump the plan around. */
  payoutsSoFar: string
  /** Drawdown room the trader wants left after the payout, as typed. */
  payoutBuffer: string
  onEraChange: (era: Era) => void
  onPayoutsChange: (payoutsSoFar: string) => void
  onBufferChange: (room: string) => void
  idPrefix: string
  disabled?: boolean
  invalid?: boolean
  className?: string
}

const SEGMENT =
  'px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

/** A figure inside a sentence: the numbers are what the eye is looking for. */
function Figure({ children }: { children: ReactNode }) {
  return (
    <span className="font-figure font-semibold text-foreground">{children}</span>
  )
}

/**
 * The two things that decide what a payout may be worth: how many the trader
 * has taken, and which schedule the account is on. Shown for any account whose
 * firm graduates its payouts or changed terms on a date, in the walkthrough
 * and again in the dashboard's account settings.
 */
export function ScheduleControls({
  template,
  era,
  payoutsSoFar,
  payoutBuffer,
  onEraChange,
  onPayoutsChange,
  onBufferChange,
  idPrefix,
  disabled = false,
  invalid = false,
  className,
}: ScheduleControlsProps) {
  const cutoff = programOf(template).cutoff
  const taken = Math.max(0, Math.floor(parseAmount(payoutsSoFar)))
  const schedule = scheduleFor(template, era)
  const next = nextPayoutNumber(taken)
  const cap = payoutCap(schedule, taken)
  const goal = profitGoal(schedule, taken)
  const consistency = consistencyFor(template, era, taken)
  const risingConsistency = (schedule.consistencies?.length ?? 0) > 1
  const buffer = Math.max(0, parseAmount(payoutBuffer))
  const threshold = payoutThreshold(schedule, taken, buffer)
  // What the payout actually leaves: the buffer, or more where the firm's
  // own qualifying balance is higher than floor plus cap plus buffer.
  const left = drawdownRoomAt(schedule, taken, threshold)
  const thin = roomIsThin(template, left)
  const capped = next >= schedule.caps.length

  return (
    <div className={cn('grid gap-5', className)}>
      {template.before && cutoff && (
        <div className="grid gap-2">
          <Label id={`${idPrefix}-era-label`}>When did you buy this account?</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={era}
            onValueChange={(value) => {
              if (value) onEraChange(value as Era)
            }}
            disabled={disabled}
            aria-labelledby={`${idPrefix}-era-label`}
            className="w-fit"
          >
            <ToggleGroupItem value="current" className={SEGMENT}>
              On or after {cutoff.date}
            </ToggleGroupItem>
            <ToggleGroupItem value="before" className={SEGMENT}>
              Before it
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs leading-snug text-muted-foreground">
            The cutoff is {cutoff.date} at {cutoff.time}. Accounts bought before
            it keep the older payout schedule.
          </p>
        </div>
      )}

      <MoneyField
        id={`${idPrefix}-payouts`}
        label="Payouts taken so far"
        unit="payouts"
        hint="On this account, since it was funded. Enter 0 if you have not taken one."
        value={payoutsSoFar}
        disabled={disabled}
        invalid={invalid}
        onChange={onPayoutsChange}
      />

      {/* The floor fails the account at or below it, so a payout that lands
          exactly on it has already breached. No firm publishes a cushion, so
          the trader sets their own the way MyFundedFutures fixes $2,100. */}
      {schedule.floorBreaches && (
        <MoneyField
          id={`${idPrefix}-buffer`}
          label="Payout buffer"
          hint={`What a payout leaves above the ${formatRule(schedule.floor)} floor, which fails the account at or below it. ${firmOf(template).name} sets no figure, so this one is yours.`}
          value={payoutBuffer}
          disabled={disabled}
          onChange={onBufferChange}
        />
      )}

      <p className="text-sm leading-snug text-muted-foreground">
        Payout {next} can be up to{' '}
        <Figure>{formatRule(cap)}</Figure>
        {capped && schedule.caps.length > 1
          ? ', as can every one after it. '
          : '. '}
        {goal > 0 && (
          <>
            It unlocks at <Figure>{formatRule(goal)}</Figure> of profit since
            your last payout, which resets with every one.{' '}
          </>
        )}
        {risingConsistency && (
          <>
            Its consistency rule is{' '}
            <Figure>{formatPercent(consistency)}</Figure>.{' '}
          </>
        )}
        The balance it needs is <Figure>{formatRule(threshold)}</Figure>
        {left === null ? (
          '.'
        ) : (
          <>
            , leaving <Figure>{formatRule(left)}</Figure> of drawdown room.
          </>
        )}
      </p>

      {thin && left !== null && template.drawdown !== undefined && (
        <Alert role="note">
          <TriangleAlert />
          <AlertTitle>
            That leaves {formatRule(left)} of drawdown room
          </AlertTitle>
          <AlertDescription>
            A loss of {formatRule(left)} after the payout would fail the
            account, and this one started with {formatRule(template.drawdown)}{' '}
            of drawdown to play with. Raise the buffer to take less out and
            keep more room, or take the payout later at a higher balance.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
