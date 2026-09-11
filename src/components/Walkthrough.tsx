import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Ledger } from '@/components/Ledger'
import { MoneyField } from '@/components/MoneyField'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { calculate, planFor, type Plan, type Strategy } from '@/lib/calc'
import { formatCurrency } from '@/lib/format'
import {
  isAmount,
  newId,
  sortByDate,
  suggestDate,
  summarize,
  type DayEntry,
} from '@/lib/ledger'
import {
  deriveInputs,
  stepsFor,
  type Approach,
  type Rules,
  type SetupDraft,
  type StepId,
} from '@/lib/setup'

export interface WalkthroughResult
  extends Omit<SetupDraft, 'approach' | 'payoutTaken' | 'strategy'> {
  approach: Approach
  payoutTaken: boolean
  strategy: Strategy
}

interface WalkthroughProps {
  initial: SetupDraft
  /** Account rules, used to preview each strategy's plan. */
  rules: Rules
  onFinish: (result: WalkthroughResult) => void
  /** Present when reopened from the dashboard, so the trader can back out. */
  onCancel?: () => void
}

const APPROACHES: {
  value: Approach
  title: string
  summary: string
  provides: ReactNode[]
}[] = [
  {
    value: 'pointInTime',
    title: 'Point-in-time',
    summary: 'Copy three numbers from your account. The quickest way to an answer.',
    provides: [
      'Current balance',
      'Largest profit day',
      <>
        Cumulative profit,{' '}
        <strong className="font-semibold">which resets after each payout</strong>
      </>,
    ],
  },
  {
    value: 'dayByDay',
    title: 'Day-by-day',
    summary:
      'Log each trading day. Your largest day and cumulative profit are worked out for you.',
    provides: [
      'Each day’s profit, positive or negative',
      <>
        Current balance,{' '}
        <strong className="font-semibold">
          only if you’ve already taken a payout
        </strong>
      </>,
    ],
  },
]

const STRATEGIES: {
  value: Strategy
  title: string
  summary: string
  example?: string
}[] = [
  {
    value: 'conservative',
    title: 'Conservative',
    summary:
      'Each day stays at or under the default daily cap or your largest profit day, whichever is higher. Your target stays put, but it can take more days.',
  },
  {
    value: 'aggressive',
    title: 'Aggressive',
    summary:
      'The fewest days to reach payout, whatever each day needs to make. Bigger days raise your largest day, and the target with it.'
  }
]

function planText(plan: Plan): string {
  return `${plan.days} ${plan.days === 1 ? 'day' : 'days'} at ${formatCurrency(plan.dailyProfit)}`
}

function stepCopy(step: StepId, payoutTaken: boolean | null) {
  switch (step) {
    case 'approach':
      return {
        title: 'How do you want to track this payout?',
        lead: 'Pick the one that matches what you have in front of you. You can switch later.',
      }
    case 'payout':
      return {
        title: 'Have you taken a payout from this account yet?',
        lead: 'If you have, you’ll enter your current balance next. If not, it’s worked out from the days you log.',
      }
    case 'balance':
      return {
        title: 'What’s your current balance?',
        lead: 'Enter your profit above the $50,000 starting balance. An account showing $54,758.34 means 4,758.34.',
      }
    case 'largest':
      return {
        title: 'What’s your largest profit day?',
        lead: 'Your single best day since your last payout. Enter 0 if you haven’t had a winning day yet.',
      }
    case 'cumulative':
      return {
        title: 'What’s your cumulative profit since your last payout?',
        lead: 'Winning days minus losing days. It resets to zero after each payout, and it can be negative.',
      }
    case 'days':
      return {
        title: 'Log each trading day',
        lead: payoutTaken
          ? 'Add every day since your last payout, losing days too. You can add more later.'
          : 'Add every day since the account started, losing days too. Your balance is worked out from these, and you can add more later.',
      }
    case 'strategy':
      return {
        title: 'How fast do you want to reach your payout?',
        lead: 'This sets how much each planned day has to make. You can switch later.',
      }
  }
}

function ChoiceCard({
  id,
  value,
  title,
  children,
}: {
  id: string
  value: string
  title: string
  children: ReactNode
}) {
  return (
    <Label
      htmlFor={id}
      className="flex h-full cursor-pointer flex-col items-start gap-3 rounded-lg border bg-card p-5 leading-normal font-normal transition-colors hover:border-foreground/30 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary/25"
    >
      <span className="flex w-full items-center justify-between gap-4">
        <span id={`${id}-title`} className="font-expanded text-lg font-bold">
          {title}
        </span>
        <RadioGroupItem
          id={id}
          value={value}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-desc`}
        />
      </span>
      <span id={`${id}-desc`} className="grid gap-3">
        {children}
      </span>
    </Label>
  )
}

export function Walkthrough({
  initial,
  rules,
  onFinish,
  onCancel,
}: WalkthroughProps) {
  const [draft, setDraft] = useState<SetupDraft>(initial)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const shownIndex = useRef(index)

  const steps = stepsFor(draft)
  const step = steps[Math.min(index, steps.length - 1)]
  const isLast = index >= steps.length - 1
  const copy = stepCopy(step, draft.payoutTaken)

  const sortedDays = useMemo(() => sortByDate(draft.days), [draft.days])
  const daySummary = useMemo(() => summarize(sortedDays), [sortedDays])

  // Each strategy's plan for the numbers entered so far.
  const preview = useMemo(() => {
    if (step !== 'strategy' || !draft.approach) return null
    const inputs = deriveInputs(
      {
        approach: draft.approach,
        payoutTaken: draft.payoutTaken === true,
        balance: draft.balance,
        largestProfitDay: draft.largestProfitDay,
        netProfit: draft.netProfit,
      },
      daySummary,
      rules,
    )
    if (inputs.consistencyRequirement <= 0) return null
    const results = calculate(inputs)
    return {
      targetMet: results.targetMet,
      conservative: planFor(inputs, results, 'conservative'),
      aggressive: planFor(inputs, results, 'aggressive'),
    }
  }, [step, draft, daySummary, rules])

  // Move focus to the new screen's input (or its question) as it appears.
  useEffect(() => {
    if (shownIndex.current === index) return
    shownIndex.current = index
    ;(fieldRef.current ?? headingRef.current)?.focus()
  }, [index])

  function update(patch: Partial<SetupDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
  }

  function updateDays(change: (days: DayEntry[]) => DayEntry[]) {
    setDraft((d) => ({ ...d, days: change(d.days) }))
  }

  function problem(): string | null {
    switch (step) {
      case 'approach':
        return draft.approach ? null : 'Choose an approach to continue.'
      case 'payout':
        return draft.payoutTaken === null ? 'Choose yes or not yet to continue.' : null
      case 'balance':
        return isAmount(draft.balance)
          ? null
          : 'Enter your balance as a dollar amount, like 4758.34.'
      case 'largest':
        return isAmount(draft.largestProfitDay)
          ? null
          : 'Enter a dollar amount. Use 0 if you haven’t had a winning day.'
      case 'cumulative':
        return isAmount(draft.netProfit)
          ? null
          : 'Enter a dollar amount. It can be negative.'
      case 'days':
        return null
      case 'strategy':
        return draft.strategy
          ? null
          : 'Choose conservative or aggressive to continue.'
    }
  }

  function advance() {
    const issue = problem()
    if (issue) {
      setError(issue)
      return
    }
    if (isLast && draft.approach) {
      onFinish({
        ...draft,
        approach: draft.approach,
        payoutTaken: draft.approach === 'dayByDay' && draft.payoutTaken === true,
        strategy: draft.strategy ?? 'conservative',
      })
      return
    }
    setIndex((i) => i + 1)
  }

  function back() {
    setError(null)
    setIndex((i) => Math.max(0, i - 1))
  }

  const isField = step === 'balance' || step === 'largest' || step === 'cumulative'

  let body: ReactNode
  switch (step) {
    case 'approach':
      body = (
        <>
          <RadioGroup
            value={draft.approach ?? ''}
            onValueChange={(v) => update({ approach: v as Approach })}
            aria-label="Approach"
            className="grid gap-4 sm:grid-cols-2"
          >
            {APPROACHES.map((a) => (
              <ChoiceCard
                key={a.value}
                id={`approach-${a.value}`}
                value={a.value}
                title={a.title}
              >
                <span className="text-sm text-muted-foreground">{a.summary}</span>
                <span className="text-sm font-medium">You’ll provide</span>
                <span className="grid gap-1.5 text-sm">
                  {a.provides.map((item, i) => (
                    <span key={i} className="flex gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-primary"
                      />
                      {/* One span so bold phrases wrap inline with their line. */}
                      <span>{item}</span>
                    </span>
                  ))}
                </span>
              </ChoiceCard>
            ))}
          </RadioGroup>
          {/* Guidance, not an error: "note" keeps screen readers from
              announcing it as urgent on page load. */}
          <Alert role="note" className="mt-6">
            <Info />
            <AlertTitle>Already taken a payout?</AlertTitle>
            <AlertDescription>
              Only include values from after your last payout: your largest
              profit day, cumulative profit, and each day you log. Enter your
              balance as it stands today.
            </AlertDescription>
          </Alert>
        </>
      )
      break
    case 'payout':
      body = (
        <RadioGroup
          value={draft.payoutTaken === null ? '' : draft.payoutTaken ? 'yes' : 'no'}
          onValueChange={(v) => update({ payoutTaken: v === 'yes' })}
          aria-label="Payout taken"
          className="grid gap-4 sm:grid-cols-2"
        >
          <ChoiceCard id="payout-yes" value="yes" title="Yes">
            <span className="text-sm text-muted-foreground">
              You’ll enter your current balance next.
            </span>
          </ChoiceCard>
          <ChoiceCard id="payout-no" value="no" title="Not yet">
            <span className="text-sm text-muted-foreground">
              Your balance is worked out from the days you log.
            </span>
          </ChoiceCard>
        </RadioGroup>
      )
      break
    case 'balance':
      body = (
        <MoneyField
          id="walkthrough-balance"
          label="Current balance"
          hideLabel
          size="lg"
          value={draft.balance}
          onChange={(v) => update({ balance: v })}
          error={error}
          inputRef={fieldRef}
          onEnter={advance}
        />
      )
      break
    case 'largest':
      body = (
        <MoneyField
          id="walkthrough-largest"
          label="Largest profit day"
          hideLabel
          size="lg"
          value={draft.largestProfitDay}
          onChange={(v) => update({ largestProfitDay: v })}
          error={error}
          inputRef={fieldRef}
          onEnter={advance}
        />
      )
      break
    case 'cumulative':
      body = (
        <MoneyField
          id="walkthrough-cumulative"
          label="Cumulative profit"
          hideLabel
          size="lg"
          value={draft.netProfit}
          onChange={(v) => update({ netProfit: v })}
          error={error}
          inputRef={fieldRef}
          onEnter={advance}
        />
      )
      break
    case 'days':
      body = (
        <Ledger
          compact
          entries={sortedDays}
          summary={daySummary}
          suggestedDate={suggestDate(sortedDays)}
          onAdd={(entry) =>
            updateDays((days) => [...days, { id: newId(), ...entry }])
          }
          onUpdate={(id, patch) =>
            updateDays((days) =>
              days.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            )
          }
          onRemove={(id) => updateDays((days) => days.filter((d) => d.id !== id))}
        />
      )
      break
    case 'strategy':
      body = (
        <>
          <RadioGroup
            value={draft.strategy ?? ''}
            onValueChange={(v) => update({ strategy: v as Strategy })}
            aria-label="Strategy"
            className="grid gap-4 sm:grid-cols-2"
          >
            {STRATEGIES.map((s) => {
              const plan = preview?.[s.value]
              return (
                <ChoiceCard
                  key={s.value}
                  id={`strategy-${s.value}`}
                  value={s.value}
                  title={s.title}
                >
                  <span className="text-sm text-muted-foreground">
                    {s.summary}
                  </span>
                  {s.example && (
                    <span className="text-sm text-muted-foreground">
                      {s.example}
                    </span>
                  )}
                  {preview && plan && (
                    <span className="border-t pt-3 text-sm">
                      Your plan:{' '}
                      <span className="font-figure font-semibold">
                        {preview.targetMet
                          ? 'target already reached'
                          : planText(plan)}
                      </span>
                    </span>
                  )}
                </ChoiceCard>
              )
            })}
          </RadioGroup>
          {preview &&
            !preview.targetMet &&
            preview.conservative.days === preview.aggressive.days && (
              <p className="mt-4 text-sm text-muted-foreground">
                For your numbers right now, both come out the same.
              </p>
            )}
        </>
      )
      break
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5.5rem)] max-w-3xl flex-col pb-10">
      <div className="pt-4 sm:pt-10">
        <div className="flex min-h-8 items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Keep my current setup
            </Button>
          )}
        </div>
        <Progress
          value={((index + 1) / steps.length) * 100}
          aria-label={`Step ${index + 1} of ${steps.length}`}
          className="mt-3 h-1"
        />
      </div>

      <div
        key={step}
        className="animate-in pt-10 duration-300 fade-in slide-in-from-bottom-2 sm:pt-16"
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display max-w-[22ch] text-[clamp(2rem,5.2vw,3.5rem)] leading-[0.98] text-balance outline-none"
        >
          {copy.title}
        </h1>
        <p className="mt-4 max-w-[58ch] text-base text-muted-foreground sm:text-lg">
          {copy.lead}
        </p>
        <div className="mt-10">{body}</div>
        {error && !isField && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="flex-1" />

      <div className="mt-12 flex items-center justify-between gap-3 border-t pt-5">
        {index > 0 ? (
          <Button variant="ghost" onClick={back}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button size="lg" onClick={advance}>
          {isLast ? 'Show my plan' : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
