import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Confetti } from '@/components/Confetti'
import { Ledger } from '@/components/Ledger'
import { MoneyField } from '@/components/MoneyField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  accountTemplate,
  firmOf,
  maxPayoutFor,
  nextPayoutNumber,
  scheduleFor,
  type Terms,
} from '@/lib/accounts'
import { formatCurrency } from '@/lib/format'
import {
  isAmount,
  newId,
  parseAmount,
  sortByDate,
  suggestDate,
  summarize,
  type DayEntry,
} from '@/lib/ledger'
import type { Approach, Snapshot } from '@/lib/setup'
import { cn } from '@/lib/utils'

export interface PayoutResult {
  /** What was withdrawn, which comes off the balance. */
  amount: number
  /** The balance the next cycle starts from. */
  balance: number
  /** Days traded since the payout; empty unless any were logged. */
  days: DayEntry[]
  /** Point-in-time numbers since the payout. */
  snapshot: Snapshot
}

interface PayoutFlowProps {
  templateId: string
  terms: Terms
  payoutsSoFar: number
  approach: Approach
  /** The balance the payout comes out of. */
  balance: number
  /** How many days are about to be cleared. */
  loggedDays: number
  onFinish: (result: PayoutResult) => void
  onCancel: () => void
}

type Step = 'amount' | 'confirm' | 'profit' | 'since'

const EMPTY_SNAPSHOT: Snapshot = {
  largestProfitDay: '',
  netProfit: '',
  tradingDays: '',
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t py-3">
      <span className="text-sm">{label}</span>
      <span
        className={cn(
          'font-figure whitespace-nowrap',
          strong ? 'text-2xl font-semibold' : 'text-lg',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * What happens after a payout is taken: how much came out, what the balance
 * is now, and what has been traded since. It clears the cycle behind it, which
 * is why the numbers are shown for confirmation before anything is written.
 */
export function PayoutFlow({
  templateId,
  terms,
  payoutsSoFar,
  approach,
  balance,
  loggedDays,
  onFinish,
  onCancel,
}: PayoutFlowProps) {
  const template = accountTemplate(templateId)
  const schedule = scheduleFor(template, terms)
  const firm = firmOf(template).name
  const most = maxPayoutFor(schedule, payoutsSoFar, balance)
  const number = nextPayoutNumber(payoutsSoFar)

  const [amount, setAmount] = useState(String(most))
  const [madeProfit, setMadeProfit] = useState<boolean | null>(null)
  const [days, setDays] = useState<DayEntry[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const [step, setStep] = useState<Step>('amount')
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)

  const steps: Step[] = madeProfit
    ? ['amount', 'confirm', 'profit', 'since']
    : ['amount', 'confirm', 'profit']
  const index = steps.indexOf(step)

  const sorted = useMemo(() => sortByDate(days), [days])
  const summary = useMemo(() => summarize(sorted), [sorted])
  const taken = parseAmount(amount)
  const left = Math.round((balance - taken) * 100) / 100

  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    headingRef.current?.focus()
  }, [step])

  function problem(): string | null {
    switch (step) {
      case 'amount':
        if (!isAmount(amount) || taken <= 0) {
          return 'Enter what you withdrew, as a dollar amount.'
        }
        if (taken > most + 1e-9) {
          return `That is more than the ${formatCurrency(most)} this payout allows.`
        }
        if (taken < schedule.minimumPayout) {
          return `${firm} pays out ${formatCurrency(schedule.minimumPayout)} at the least.`
        }
        return null
      case 'profit':
        return madeProfit === null ? 'Choose yes or not yet to continue.' : null
      default:
        return null
    }
  }

  function advance() {
    const issue = problem()
    if (issue) {
      setError(issue)
      return
    }
    setError(null)
    if (step === 'amount') return setStep('confirm')
    if (step === 'confirm') return setStep('profit')
    if (step === 'profit' && madeProfit) return setStep('since')
    onFinish({
      amount: taken,
      balance: left,
      days: madeProfit ? days : [],
      snapshot: madeProfit ? snapshot : EMPTY_SNAPSHOT,
    })
  }

  function back() {
    setError(null)
    const to = steps[Math.max(0, index - 1)]
    setStep(to)
  }

  const copy: Record<Step, { title: string; lead: string }> = {
    amount: {
      title: 'Congratulations on taking a payout!',
      lead: `Enter what you withdrew and the app will start your next cycle from what is left. Payout ${number} allows up to ${formatCurrency(most)}.`,
    },
    confirm: {
      title: 'Does this look correct?',
      lead: 'This is where the next cycle starts from, and what it clears behind it.',
    },
    profit: {
      title: 'Have you made any profit since taking the payout?',
      lead: 'If you have, you can put it in now. If not, the next cycle starts empty.',
    },
    since: {
      title: approach === 'dayByDay' ? 'Log each trading day' : 'What have you made since?',
      lead:
        approach === 'dayByDay'
          ? 'Every day since the payout, losing days too. You can add more later.'
          : 'Your numbers since the payout. They start counting again from zero.',
    },
  }

  let body: ReactNode
  switch (step) {
    case 'amount':
      body = (
        <MoneyField
          id="payout-amount"
          label="Payout amount"
          hideLabel
          size="lg"
          value={amount}
          error={error}
          onChange={setAmount}
          onEnter={advance}
        />
      )
      break
    case 'confirm':
      body = (
        <div className="max-w-xl">
          <Row label="Balance before" value={formatCurrency(balance)} />
          <Row label={`Payout ${number}`} value={`−${formatCurrency(taken)}`} />
          <Row label="Balance now" value={formatCurrency(left)} strong />
          <p className="mt-5 text-sm text-muted-foreground">
            {loggedDays > 0
              ? `Your ${loggedDays} logged ${loggedDays === 1 ? 'day' : 'days'} will be cleared, since ${firm} counts profit and trading days from the last payout.`
              : `Your profit and trading days will be cleared, since ${firm} counts both from the last payout.`}
          </p>
        </div>
      )
      break
    case 'profit':
      body = (
        <RadioGroup
          value={madeProfit === null ? '' : madeProfit ? 'yes' : 'no'}
          onValueChange={(v) => {
            setMadeProfit(v === 'yes')
            setError(null)
          }}
          aria-label="Profit since the payout"
          className="grid gap-4 sm:grid-cols-2"
        >
          {[
            { value: 'yes', title: 'Yes', note: 'You will put it in next.' },
            { value: 'no', title: 'Not yet', note: 'The next cycle starts empty.' },
          ].map((option) => (
            <Label
              key={option.value}
              htmlFor={`profit-${option.value}`}
              className="flex h-full cursor-pointer flex-col items-start gap-3 rounded-lg border bg-card p-5 leading-normal font-normal transition-colors hover:border-foreground/30 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary/25"
            >
              <span className="flex w-full items-center justify-between gap-4">
                <span
                  id={`profit-${option.value}-title`}
                  className="font-expanded text-lg font-bold"
                >
                  {option.title}
                </span>
                <RadioGroupItem
                  id={`profit-${option.value}`}
                  value={option.value}
                  aria-labelledby={`profit-${option.value}-title`}
                />
              </span>
              <span className="text-sm text-muted-foreground">{option.note}</span>
            </Label>
          ))}
        </RadioGroup>
      )
      break
    case 'since':
      body =
        approach === 'dayByDay' ? (
          <Ledger
            compact
            entries={sorted}
            summary={summary}
            suggestedDate={suggestDate(sorted)}
            onAdd={(entry) => setDays((prev) => [...prev, { id: newId(), ...entry }])}
            onUpdate={(id, patch) =>
              setDays((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
            }
            onRemove={(id) => setDays((prev) => prev.filter((d) => d.id !== id))}
          />
        ) : (
          <div className="grid max-w-xl gap-5 sm:grid-cols-2">
            <MoneyField
              id="payout-largest"
              label="Largest profit day"
              value={snapshot.largestProfitDay}
              onChange={(v) =>
                setSnapshot((prev) => ({ ...prev, largestProfitDay: v }))
              }
            />
            <MoneyField
              id="payout-net"
              label="Cumulative profit"
              value={snapshot.netProfit}
              onChange={(v) => setSnapshot((prev) => ({ ...prev, netProfit: v }))}
            />
          </div>
        )
      break
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5.5rem)] max-w-3xl flex-col pb-10">
      {step === 'amount' && <Confetti />}
      <div className="pt-4 sm:pt-10">
        <div className="flex min-h-8 items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Not yet, go back
          </Button>
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
          {copy[step].title}
        </h1>
        <p className="mt-4 max-w-[58ch] text-base text-muted-foreground sm:text-lg">
          {copy[step].lead}
        </p>
        <div className="mt-10">{body}</div>
        {error && step !== 'amount' && (
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
          {step === 'since' || (step === 'profit' && madeProfit === false)
            ? 'Start the next cycle'
            : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
