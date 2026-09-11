import { MoneyField } from '@/components/MoneyField'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Plan } from '@/lib/calc'
import { formatPlan, MAX_SPELLED_COUNT } from '@/lib/format'
import type { CuratedDraft } from '@/lib/setup'
import { cn } from '@/lib/utils'

interface CuratedControlsProps {
  value: CuratedDraft
  onChange: (patch: Partial<CuratedDraft>) => void
  /** Fewest days any plan can reach payout in; the lowest day count offered. */
  fastest: number
  /** The resulting plan, or null while the choice is incomplete. */
  plan: Plan | null
  /** Keeps ids unique between the walkthrough and the dashboard. */
  idPrefix: string
  className?: string
}

const SEGMENT =
  'px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

export function CuratedControls({
  value,
  onChange,
  fastest,
  plan,
  idPrefix,
  className,
}: CuratedControlsProps) {
  // Day counts run from the fastest plan up to the highest count the
  // headline spells out.
  const dayOptions: number[] = []
  for (let n = Math.max(1, fastest); n <= MAX_SPELLED_COUNT; n++) {
    dayOptions.push(n)
  }
  const selectedDays = value.mode === 'days' && plan ? plan.days : value.days

  return (
    <div className={cn('grid gap-4', className)}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value.mode}
        onValueChange={(mode) => {
          if (mode) onChange({ mode: mode as CuratedDraft['mode'] })
        }}
        aria-label="Curate by"
        className="justify-self-start"
      >
        <ToggleGroupItem value="days" className={SEGMENT}>
          Number of days
        </ToggleGroupItem>
        <ToggleGroupItem value="cap" className={SEGMENT}>
          Daily cap
        </ToggleGroupItem>
      </ToggleGroup>

      {value.mode === 'days' ? (
        dayOptions.length > 0 ? (
          <div className="grid gap-2">
            <p id={`${idPrefix}-days-label`} className="text-sm font-medium">
              Trading days
            </p>
            <ToggleGroup
              type="single"
              variant="outline"
              value={selectedDays ? String(selectedDays) : ''}
              onValueChange={(days) => {
                if (days) onChange({ days: Number(days) })
              }}
              aria-labelledby={`${idPrefix}-days-label`}
              className="justify-self-start"
            >
              {dayOptions.map((n) => (
                <ToggleGroupItem
                  key={n}
                  value={String(n)}
                  aria-label={`${n} ${n === 1 ? 'day' : 'days'}`}
                  className={cn('w-10 font-figure', SEGMENT)}
                >
                  {n}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {fastest >= MAX_SPELLED_COUNT
                ? `${MAX_SPELLED_COUNT} is the fewest days possible right now.`
                : `From ${fastest}, the fewest possible, up to ${MAX_SPELLED_COUNT}.`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your fastest plan already takes {fastest} days, more than the{' '}
            {MAX_SPELLED_COUNT}-day limit. Set a daily cap instead.
          </p>
        )
      ) : (
        <div className="max-w-xs">
          <MoneyField
            id={`${idPrefix}-cap`}
            label="Daily cap"
            hint="The most you want to make in a single day."
            value={value.cap}
            onChange={(cap) => onChange({ cap })}
          />
        </div>
      )}

      {plan && (
        <p className="text-sm">
          That’s{' '}
          <span className="font-figure font-semibold">
            {formatPlan(plan.days, plan.dailyProfit)}
          </span>
          {plan.days > 1 ? ' each' : ''}.
        </p>
      )}
    </div>
  )
}
