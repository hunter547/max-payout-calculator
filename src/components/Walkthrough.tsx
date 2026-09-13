import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { CuratedControls } from '@/components/CuratedControls'
import { FirmLogo } from '@/components/FirmLogo'
import { Ledger } from '@/components/Ledger'
import { MoneyField } from '@/components/MoneyField'
import { ScheduleControls } from '@/components/ScheduleControls'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  accountFor,
  accountLabel,
  accountTemplate,
  defaultBuffer,
  firm,
  firmOf,
  FIRMS,
  graduates,
  payoutCap,
  payoutThreshold,
  profitGoal,
  program,
  programsFor,
  sizesFor,
  type AccountProgram,
} from '@/lib/accounts'
import {
  calculate,
  fastestDays,
  MAX_PLAN_DAYS,
  planFor,
  type Plan,
  type Strategy,
} from '@/lib/calc'
import { formatCurrency, formatPercent, formatRule } from '@/lib/format'
import {
  isAmount,
  newId,
  parseAmount,
  sortByDate,
  suggestDate,
  summarize,
  type DayEntry,
} from '@/lib/ledger'
import {
  balanceHint,
  deriveInputs,
  hasTakenPayout,
  resolvePlan,
  stepsFor,
  toCuratedChoice,
  type Approach,
  type SetupDraft,
  type StepId,
} from '@/lib/setup'
import { cn } from '@/lib/utils'

export interface WalkthroughResult
  extends Omit<SetupDraft, 'approach' | 'payoutTaken' | 'strategy'> {
  approach: Approach
  payoutTaken: boolean
  strategy: Strategy
}

interface WalkthroughProps {
  initial: SetupDraft
  onFinish: (result: WalkthroughResult) => void
  /** Fires as the firm is picked, so the app can move to its theme at once. */
  onFirmChange?: (firmId: string) => void
  /** Fires as the account is picked; empty when the firm change cleared it. */
  onAccountChange?: (templateId: string) => void
  /** Present when reopened from the dashboard, so the trader can back out. */
  onCancel?: () => void
}

/**
 * What each approach will ask for, in the order the screens ask it. Two of the
 * lines are conditional: a balance is only asked for once a payout has been
 * taken, and trading days only where a firm's minimum tops what its
 * consistency rule already takes.
 */
const APPROACHES: {
  value: Approach
  title: string
  summary: string
  provides: (asked: { balance: boolean; days: boolean }) => ReactNode[]
}[] = [
  {
    value: 'pointInTime',
    title: 'Point-in-time',
    summary: 'Copy a few numbers from your account. The quickest way to an answer.',
    provides: ({ balance, days }) => [
      ...(balance ? ['Current balance'] : []),
      'Largest profit day',
      <>
        Cumulative profit,{' '}
        <strong className="font-semibold">which resets after each payout</strong>
      </>,
      ...(days ? ['Trading days so far'] : []),
    ],
  },
  {
    value: 'dayByDay',
    title: 'Day-by-day',
    summary:
      'Log each trading day. Your largest day, cumulative profit, and trading days are worked out for you.',
    provides: ({ balance }) => [
      ...(balance ? ['Current balance'] : []),
      'Each day’s profit, positive or negative',
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
  },
  {
    value: 'curated',
    title: 'Curated',
    summary:
      'Choose how many trading days you want, or the most you want to make in a day. The plan works out the rest.'
  }
]

/** "Growth: 4 sizes, 25k to 150k" — one line per type on a firm's card. */
function typeLine(program: AccountProgram): string {
  const sizes = sizesFor(program.id)
  return sizes.length === 1
    ? `${program.name}: one size, ${sizes[0].name}`
    : `${program.name}: ${sizes.length} sizes, ${sizes[0].name} to ${sizes[sizes.length - 1].name}`
}

function planText(plan: Plan): string {
  return `${plan.days} ${plan.days === 1 ? 'day' : 'days'} at ${formatCurrency(plan.dailyProfit)}`
}

function stepCopy(step: StepId, draft: SetupDraft) {
  const template = accountTemplate(draft.templateId)
  switch (step) {
    case 'firm':
      return {
        title: 'Which prop firm?',
        lead: 'Pick where your funded account is. The app takes on the firm’s look, and its rules fill in as you go.',
      }
    case 'program':
      return {
        title: 'Which account type?',
        lead: `The type sets ${firm(draft.firmId).name}’s rules for you: its consistency rule and the trading days a payout needs. You can adjust them later.`,
      }
    case 'size':
      return {
        title: 'Which account size?',
        lead: 'The size sets where your balance starts and the balance a max payout needs.',
      }
    case 'payouts': {
      const counts =
        graduates(template.payout) || graduates(template.alt ?? template.payout)
      return {
        title: counts
          ? 'Where are you in your payout schedule?'
          : 'How is this account set up?',
        lead: counts
          ? `${firmOf(template).name} caps each payout by how many you have taken, so the count sets your target${
              template.alt ? ', as do the terms you are on' : ''
            }. You also set the buffer a payout leaves behind, which the firm does not fix for you.`
          : `What ${firmOf(template).name} lets you withdraw depends on it.`,
      }
    }
    case 'approach':
      return {
        title: 'How do you want to track this payout?',
        lead: 'Pick the one that matches what you have in front of you. You can switch later.',
      }
    case 'payout':
      return {
        title: 'Have you taken a payout from this account yet?',
        lead: 'If you have, you’ll give your current balance. If not, it’s where the account started plus the profit you have made since.',
      }
    case 'balance':
      return {
        title: 'What’s your current balance?',
        lead: balanceHint(draft.templateId),
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
    case 'tradingDays':
      return {
        title:
          template.qualifyingDayProfit > 0
            ? 'How many of your days count so far?'
            : 'How many days have you traded since your last payout?',
        lead: `${firmOf(template).name} needs ${template.minTradingDays} trading ${template.minTradingDays === 1 ? 'day' : 'days'} before it will pay out${
          template.qualifyingDayProfit > 0
            ? `, and only days making more than ${formatRule(template.qualifyingDayProfit)} count towards them`
            : ''
        }. Enter 0 if this cycle is fresh.`,
      }
    case 'days':
      return {
        title: 'Log each trading day',
        lead: draft.payoutTaken
          ? 'Add every day since your last payout, losing days too. You can add more later.'
          : 'Add every day since the account was funded, losing days too. Your balance is worked out from these, and you can add more later.',
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
  logo,
  className,
  children,
}: {
  id: string
  value: string
  title: string
  /** Shown above the title, for cards that stand for a firm. */
  logo?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex h-full cursor-pointer flex-col items-start gap-3 rounded-lg border bg-card p-5 leading-normal font-normal transition-colors hover:border-foreground/30 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-primary/25',
        className,
      )}
    >
      {logo && <span className="flex">{logo}</span>}
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

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <span className="grid gap-1.5 text-sm">
      {items.map((item, i) => (
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
  )
}

export function Walkthrough({
  initial,
  onFinish,
  onFirmChange,
  onAccountChange,
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
  const copy = stepCopy(step, draft)

  const sortedDays = useMemo(() => sortByDate(draft.days), [draft.days])
  const qualifyingDayProfit = draft.templateId
    ? accountTemplate(draft.templateId).qualifyingDayProfit
    : 0
  const daySummary = useMemo(
    () => summarize(sortedDays, qualifyingDayProfit),
    [sortedDays, qualifyingDayProfit],
  )

  // Each strategy's plan for the numbers entered so far, on the account's
  // own rules.
  const preview = useMemo(() => {
    if (step !== 'strategy' || !draft.approach) return null
    const inputs = deriveInputs(
      {
        approach: draft.approach,
        payoutTaken: draft.payoutTaken === true,
        balance: draft.balance,
        largestProfitDay: draft.largestProfitDay,
        netProfit: draft.netProfit,
        tradingDays: draft.tradingDays,
      },
      daySummary,
      accountFor(
        accountTemplate(draft.templateId),
        draft.terms,
        parseAmount(draft.payoutsSoFar),
        parseAmount(draft.payoutBuffer),
      ),
    )
    if (inputs.consistencyRequirement <= 0) return null
    const results = calculate(inputs)
    return {
      ready: results.payoutReady,
      fastest: fastestDays(inputs, results),
      conservative: planFor(inputs, results, 'conservative'),
      aggressive: planFor(inputs, results, 'aggressive'),
      curated: resolvePlan(inputs, results, 'curated', draft.curated),
    }
  }, [step, draft, daySummary])

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

  /**
   * A firm brings its theme straight away, and as much of the account as it
   * settles on its own: a firm with one type picks that type, and a type with
   * one size picks that size.
   */
  function chooseFirm(firmId: string) {
    const types = programsFor(firmId)
    const programId = types.length === 1 ? types[0].id : ''
    const templateId = onlySize(programId)
    update({ firmId, programId, templateId, ...bufferFor(templateId) })
    onFirmChange?.(firmId)
    onAccountChange?.(templateId)
  }

  function chooseProgram(programId: string) {
    const templateId = onlySize(programId)
    update({ programId, templateId, ...bufferFor(templateId) })
    onAccountChange?.(templateId)
  }

  function chooseSize(templateId: string) {
    update({ templateId, ...bufferFor(templateId) })
    onAccountChange?.(templateId)
  }

  /** Each account starts on its own buffer, which scales with its drawdown. */
  function bufferFor(templateId: string): Partial<SetupDraft> {
    if (!templateId) return {}
    return { payoutBuffer: String(defaultBuffer(accountTemplate(templateId))) }
  }

  /** The one size a type comes in, or nothing to choose from yet. */
  function onlySize(programId: string): string {
    const sizes = programId ? sizesFor(programId) : []
    return sizes.length === 1 ? sizes[0].id : ''
  }

  function updateDays(change: (days: DayEntry[]) => DayEntry[]) {
    setDraft((d) => ({ ...d, days: change(d.days) }))
  }

  function problem(): string | null {
    switch (step) {
      case 'firm':
        return draft.firmId ? null : 'Choose a prop firm to continue.'
      case 'program':
        return draft.programId ? null : 'Choose an account type to continue.'
      case 'size':
        return draft.templateId ? null : 'Choose an account size to continue.'
      case 'payouts':
        if (!isAmount(draft.payoutsSoFar) || Number(draft.payoutsSoFar) < 0) {
          return 'Enter how many payouts you have taken, or 0.'
        }
        return isAmount(draft.payoutBuffer) && Number(draft.payoutBuffer) >= 0
          ? null
          : 'Enter the drawdown room to keep as a dollar amount.'
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
      case 'tradingDays':
        return isAmount(draft.tradingDays) && Number(draft.tradingDays) >= 0
          ? null
          : 'Enter how many days you’ve traded, or 0.'
      case 'days':
        return null
      case 'strategy': {
        if (!draft.strategy) {
          return 'Choose conservative, aggressive, or curated to continue.'
        }
        if (draft.strategy !== 'curated' || !preview || preview.ready) {
          return null
        }
        if (!toCuratedChoice(draft.curated)) {
          return draft.curated.mode === 'days'
            ? 'Pick how many trading days you want.'
            : 'Enter a daily cap as a dollar amount, like 400.'
        }
        return preview.curated
          ? null
          : `That cap would take more than ${MAX_PLAN_DAYS} trading days. Raise it.`
      }
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
        // Either approach needs it now: it decides whether the balance was
        // asked for or worked out.
        payoutTaken: hasTakenPayout(draft),
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

  // Asked before this screen, as a count or as a yes or no, so by here it is
  // always settled: a balance is only given once a payout has been taken.
  const asksBalance = hasTakenPayout(draft)
  const asksDays = stepsFor({ ...draft, approach: 'pointInTime' }).includes(
    'tradingDays',
  )

  const isField =
    step === 'balance' ||
    step === 'largest' ||
    step === 'cumulative' ||
    step === 'tradingDays'

  let body: ReactNode
  switch (step) {
    case 'firm':
      body = (
        <RadioGroup
          value={draft.firmId}
          onValueChange={chooseFirm}
          aria-label="Prop firm"
          className="grid gap-4 sm:grid-cols-2"
        >
          {FIRMS.map((f) => (
            <ChoiceCard
              key={f.id}
              id={`firm-${f.id}`}
              value={f.id}
              title={f.name}
              logo={<FirmLogo firmId={f.id} size="md" />}
            >
              <Bullets items={programsFor(f.id).map(typeLine)} />
            </ChoiceCard>
          ))}
        </RadioGroup>
      )
      break
    case 'program':
      body = (
        <RadioGroup
          value={draft.programId}
          onValueChange={chooseProgram}
          aria-label="Account type"
          className="grid gap-4 sm:grid-cols-2"
        >
          {programsFor(draft.firmId).map((p) => {
            const sizes = sizesFor(p.id)
            const days = sizes[0].minTradingDays
            const graduated = sizes.some((t) => graduates(t.payout))
            const rules = sizes[0].payout.consistencies
            return (
              <ChoiceCard
                key={p.id}
                id={`program-${p.id}`}
                value={p.id}
                title={p.name}
              >
                <Bullets
                  items={[
                    sizes.length === 1
                      ? `One size: ${sizes[0].name}`
                      : `${sizes.length} sizes: ${sizes.map((s) => s.name).join(', ')}`,
                    rules && rules.length > 1
                      ? `${formatPercent(rules[0])} consistency rule, rising to ${formatPercent(rules[rules.length - 1])}`
                      : `${formatPercent(sizes[0].consistency)} consistency rule`,
                    days === 0
                      ? 'No minimum trading days'
                      : sizes[0].qualifyingDayProfit > 0
                        ? `${days} trading ${days === 1 ? 'day' : 'days'} minimum, each over a set profit`
                        : `${days} trading ${days === 1 ? 'day' : 'days'} minimum`,
                    graduated
                      ? 'Payouts capped by how many you have taken'
                      : `${formatRule(sizes[0].payout.caps[0])} max payout per request`,
                  ]}
                />
              </ChoiceCard>
            )
          })}
        </RadioGroup>
      )
      break
    case 'size':
      body = (
        <RadioGroup
          value={draft.templateId}
          onValueChange={chooseSize}
          aria-label="Account size"
          className="grid gap-4 sm:grid-cols-2"
        >
          {sizesFor(draft.programId).map((template) => (
            <ChoiceCard
              key={template.id}
              id={`size-${template.id}`}
              value={template.id}
              title={template.name}
            >
              <Bullets
                items={[
                  `Balance starts at ${formatRule(template.startingBalance)}`,
                  // The first payout's terms; the next screen asks which one
                  // the trader is actually on.
                  ...(profitGoal(template.payout, 0) > 0
                    ? [
                        `First payout unlocks at ${formatRule(profitGoal(template.payout, 0))} of profit`,
                        `Up to ${formatRule(payoutCap(template.payout, 0))} per request`,
                      ]
                    : [
                        `${formatRule(payoutThreshold(template.payout, 0))} balance for a ${formatRule(payoutCap(template.payout, 0))} first payout`,
                      ]),
                  `${formatRule(template.payout.minimumPayout)} minimum payout`,
                  ...(template.qualifyingDayProfit > 0
                    ? [
                        `A day counts once it makes over ${formatRule(template.qualifyingDayProfit)}`,
                      ]
                    : []),
                ]}
              />
            </ChoiceCard>
          ))}
        </RadioGroup>
      )
      break
    case 'payouts':
      body = (
        <ScheduleControls
          template={accountTemplate(draft.templateId)}
          terms={draft.terms}
          payoutsSoFar={draft.payoutsSoFar}
          payoutBuffer={draft.payoutBuffer}
          onTermsChange={(terms) => update({ terms })}
          onPayoutsChange={(payoutsSoFar) => update({ payoutsSoFar })}
          onBufferChange={(payoutBuffer) => update({ payoutBuffer })}
          idPrefix="walkthrough-schedule"
          invalid={error !== null}
          className="max-w-xl rounded-lg border bg-card p-5"
        />
      )
      break
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
                <Bullets
                  items={a.provides({ balance: asksBalance, days: asksDays })}
                />
              </ChoiceCard>
            ))}
          </RadioGroup>
          {/* Only where a payout is actually behind them, and guidance
              rather than an error: "note" keeps screen readers from
              announcing it as urgent on page load. */}
          {asksBalance && (
            <Alert role="note" className="mt-6">
              <Info />
              <AlertTitle>Since you’ve already taken a payout</AlertTitle>
              <AlertDescription>
                Only include values from after your last payout: your largest
                profit day, cumulative profit, and each day you log. Enter your
                balance as it stands today.
              </AlertDescription>
            </Alert>
          )}
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
    case 'tradingDays':
      body = (
        <MoneyField
          id="walkthrough-trading-days"
          label="Trading days so far"
          hideLabel
          unit="days"
          size="lg"
          value={draft.tradingDays}
          onChange={(v) => update({ tradingDays: v })}
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
                  className={s.value === 'curated' ? 'sm:col-span-2' : undefined}
                >
                  <span className="text-sm text-muted-foreground">
                    {s.summary}
                  </span>
                  {s.example && (
                    <span className="text-sm text-muted-foreground">
                      {s.example}
                    </span>
                  )}
                  {preview && (
                    <span className="border-t pt-3 text-sm">
                      Your plan:{' '}
                      <span className="font-figure font-semibold">
                        {preview.ready
                          ? 'payout already available'
                          : plan
                            ? planText(plan)
                            : 'pick days or a cap'}
                      </span>
                    </span>
                  )}
                </ChoiceCard>
              )
            })}
          </RadioGroup>
          {draft.strategy === 'curated' && preview && !preview.ready && (
            <CuratedControls
              idPrefix="walkthrough-curated"
              value={draft.curated}
              fastest={preview.fastest}
              plan={preview.curated}
              onChange={(patch) =>
                update({ curated: { ...draft.curated, ...patch } })
              }
              className="mt-6 rounded-lg border bg-card p-5"
            />
          )}
          {preview &&
            !preview.ready &&
            preview.conservative.days === preview.aggressive.days && (
              <p className="mt-4 text-sm text-muted-foreground">
                For your numbers right now, conservative and aggressive come
                out the same.
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
        {/* Once a firm is chosen, every screen says whose account this is,
            naming as much of it as has been settled. */}
        {step !== 'firm' && draft.firmId && (
          <p className="mb-5 flex items-center gap-2.5">
            <FirmLogo firmId={draft.firmId} />
            {step !== 'program' && (
              <span className="text-sm text-muted-foreground">
                {draft.templateId
                  ? accountLabel(accountTemplate(draft.templateId))
                  : program(draft.programId).name}
              </span>
            )}
          </p>
        )}
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
