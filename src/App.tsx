import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Moon, Sun } from 'lucide-react'
import { AccountPanel, type BalanceDisplay } from '@/components/AccountPanel'
import { CuratedControls } from '@/components/CuratedControls'
import { Ledger } from '@/components/Ledger'
import { PnlChart, type ChartBar } from '@/components/PnlChart'
import { SnapshotPanel } from '@/components/SnapshotPanel'
import { TargetBreakdown } from '@/components/TargetBreakdown'
import { ThemePicker } from '@/components/ThemePicker'
import { Walkthrough, type WalkthroughResult } from '@/components/Walkthrough'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAppearance, usePersistentState, type Appearance } from '@/hooks'
import {
  accountFor,
  accountTemplate,
  defaultBuffer,
  DEFAULT_TEMPLATE,
  firm,
  firmOf,
  FIRMS,
  hasSchedule,
  nextPayoutNumber,
  payoutCap,
  rulesFor,
  scheduleFor,
  templateLabel,
  type AccountKey,
  type Era,
} from '@/lib/accounts'
import {
  buildPlan,
  calculate,
  fastestDays,
  MAX_PLAN_DAYS,
  planFor,
  type CalcResults,
  type Plan,
  type Strategy,
} from '@/lib/calc'
import { countWord, formatCurrency, MAX_SPELLED_COUNT } from '@/lib/format'
import {
  newId,
  nextTradingDate,
  parseAmount,
  planStartDate,
  sortByDate,
  suggestDate,
  summarize,
  type DayEntry,
} from '@/lib/ledger'
import {
  CURATED_DEFAULT,
  deriveInputs,
  legacySetup,
  resolvePlan,
  toCuratedChoice,
  type CuratedDraft,
  type Setup,
  type SetupDraft,
  type Snapshot,
} from '@/lib/setup'

const SNAPSHOT_DEFAULTS: Snapshot = {
  largestProfitDay: '',
  netProfit: '',
  tradingDays: '',
}

const EMPTY_DRAFT: SetupDraft = {
  firmId: '',
  programId: '',
  templateId: '',
  era: 'current',
  payoutsSoFar: '0',
  payoutBuffer: '',
  approach: null,
  payoutTaken: null,
  strategy: null,
  curated: CURATED_DEFAULT,
  balance: '',
  largestProfitDay: '',
  netProfit: '',
  tradingDays: '',
  days: [],
}

const STRATEGY_OPTIONS: { value: Strategy; label: string }[] = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'curated', label: 'Curated' },
]

const SEGMENT =
  'px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

/** Every firm the app shows by name and logo, for the footer disclaimer. */
const FIRM_NAMES = FIRMS.map((f) => f.name)
const DISCLAIMER = `Not affiliated with or endorsed by ${
  FIRM_NAMES.length <= 2
    ? FIRM_NAMES.join(' or ')
    : `${FIRM_NAMES.slice(0, -1).join(', ')}, or ${FIRM_NAMES[FIRM_NAMES.length - 1]}`
}.`

function verdict(
  results: CalcResults,
  plan: Plan | null,
  netProfit: number,
  consistencyInvalid: boolean,
  curated: CuratedDraft,
  firm: string,
) {
  if (consistencyInvalid) {
    return {
      title: 'Set a consistency rule above 0%',
      detail:
        'The daily cap and the number of trading days both depend on it.',
    }
  }
  if (results.payoutReady) {
    return {
      title: 'Payout ready',
      detail: `Net profit of ${formatCurrency(netProfit)} clears the ${formatCurrency(results.minimumNetProfitRequired)} required, and you have the trading days ${firm} asks for.`,
    }
  }
  if (!plan) {
    const choice = toCuratedChoice(curated)
    return {
      title: 'Set your curated plan',
      detail:
        choice?.mode === 'cap'
          ? `A ${formatCurrency(choice.cap)} daily cap would take more than ${MAX_PLAN_DAYS} trading days to reach payout. Raise it below.`
          : curated.mode === 'days'
            ? 'Pick how many trading days you want below.'
            : 'Enter the most you want to make in a day below.',
    }
  }

  const days = plan.days
  const dayWord = days === 1 ? 'day' : 'days'

  // The profit is already there; only the firm's trading days are missing.
  if (results.targetMet) {
    return {
      title:
        days === 1
          ? 'One more trading day to qualify'
          : `${countWord(days)} more trading days to qualify`,
      detail: `Net profit of ${formatCurrency(netProfit)} already clears the ${formatCurrency(results.minimumNetProfitRequired)} required. ${firm} needs ${results.eligibilityDaysLeft} more trading ${results.eligibilityDaysLeft === 1 ? 'day' : 'days'} before it will pay out, whatever those days make.`,
    }
  }

  const daily = formatCurrency(plan.dailyProfit)
  const to = formatCurrency(plan.requiredProfit)
  const lift = ` Days that size lift the profit target from ${formatCurrency(results.minimumNetProfitRequired)} to ${to}, and the plan already counts that.`

  let detail = `That takes net profit from ${formatCurrency(netProfit)} to ${to}.`
  if (plan.customCap) {
    detail += ` Each day stays at or under your ${formatCurrency(plan.dailyCap)} cap.`
    if (plan.raisesTarget) detail += lift
  } else if (plan.raisesTarget) {
    detail += lift
  } else {
    detail += ` Keep each day at or under ${formatCurrency(plan.dailyCap)}; a bigger day raises the target.`
  }
  if (plan.heldByEligibility) {
    detail += ` It runs ${days} ${dayWord} because ${firm} needs ${results.eligibilityDaysLeft} more.`
  }
  if (plan.adjusted) {
    detail += ` ${countWord(days)} is the fewest days possible right now.`
  }

  return {
    title:
      days === 1
        ? `One more trading day at ${daily}`
        : `${countWord(days)} more trading days at ${daily} each`,
    detail,
  }
}

function AppHeader({
  appearance,
  account,
  children,
}: {
  appearance: Appearance
  account: string
  children?: ReactNode
}) {
  const nextScheme = appearance.scheme === 'dark' ? 'light' : 'dark'
  return (
    <header className="flex items-center justify-between gap-4 py-5">
      {/* The firm's logo belongs with its account, not up here. */}
      <div className="leading-tight">
        {account && <p className="text-sm text-muted-foreground">{account}</p>}
        <p className="font-expanded text-base font-bold">
          Max payout calculator
        </p>
      </div>
      <div className="flex items-center gap-1">
        {children}
        <ThemePicker
          value={appearance.theme.id}
          onChange={appearance.setBrand}
        />
        {/* Single-mode themes (dark-only firm brands) have nothing to toggle. */}
        {appearance.canToggleScheme && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Switch to ${nextScheme} mode`}
                onClick={appearance.toggleScheme}
              >
                {appearance.scheme === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch to {nextScheme} mode</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  )
}

export default function App() {
  const appearance = useAppearance()
  const [setup, setSetup] = usePersistentState<Setup | null>(
    'mpc.setup',
    legacySetup,
  )
  const [rules, setRules] = usePersistentState<Record<AccountKey, string>>(
    'mpc.rules',
    () => accountFor(accountTemplate(DEFAULT_TEMPLATE)),
  )
  const [storedSnapshot, setSnapshot] = usePersistentState<Snapshot>(
    'mpc.snapshot',
    SNAPSHOT_DEFAULTS,
  )
  const [days, setDays] = usePersistentState<DayEntry[]>('mpc.days', [])
  const [reconfiguring, setReconfiguring] = useState(false)
  // The account picked in the walkthrough, before anything is saved, and the
  // theme that was showing before it moved.
  const [draftTemplate, setDraftTemplate] = useState<string | null>(null)
  const brandBeforeDraft = useRef<string | null>(null)

  // Older saves predate some fields; fill the gaps rather than read undefined.
  const snapshot = useMemo<Snapshot>(
    () => ({ ...SNAPSHOT_DEFAULTS, ...storedSnapshot }),
    [storedSnapshot],
  )
  const account = useMemo<Record<AccountKey, string>>(
    () => ({ ...accountFor(accountTemplate(DEFAULT_TEMPLATE)), ...rules }),
    [rules],
  )

  const templateId = setup?.templateId ?? DEFAULT_TEMPLATE
  const template = accountTemplate(templateId)
  const era: Era = setup?.era ?? 'current'
  const payoutsSoFar = setup?.payoutsSoFar ?? 0
  const payoutBuffer = setup?.payoutBuffer ?? defaultBuffer(template)
  const schedule = scheduleFor(template, era)
  const approach = setup?.approach ?? 'dayByDay'
  const payoutTaken = setup?.payoutTaken === true
  const strategy: Strategy = setup?.strategy ?? 'conservative'
  const curated = setup?.curated ?? CURATED_DEFAULT
  const balanceEntered = approach === 'pointInTime' || payoutTaken

  const sorted = useMemo(() => sortByDate(days), [days])
  const summary = useMemo(() => summarize(sorted), [sorted])

  const inputs = useMemo(
    () =>
      deriveInputs(
        {
          approach,
          payoutTaken,
          balance: account.balance,
          largestProfitDay: snapshot.largestProfitDay,
          netProfit: snapshot.netProfit,
          tradingDays: snapshot.tradingDays,
        },
        summary,
        account,
      ),
    [approach, payoutTaken, account, snapshot, summary],
  )
  const consistency = inputs.consistencyRequirement
  const consistencyInvalid = consistency <= 0

  const results = useMemo(() => calculate(inputs), [inputs])
  const fastest = useMemo(() => fastestDays(inputs, results), [inputs, results])
  const plan = useMemo(
    () => resolvePlan(inputs, results, strategy, curated),
    [inputs, results, strategy, curated],
  )
  // Until a curated plan is set, the breakdown shows the spreadsheet's plan.
  const shownPlan = plan ?? planFor(inputs, results, 'conservative')

  const bars = useMemo<ChartBar[]>(() => {
    const logged = approach === 'dayByDay' ? sorted : []
    let running = 0
    const recorded: ChartBar[] = logged.map((entry) => {
      const amount = parseAmount(entry.amount)
      running += amount
      return {
        key: entry.id,
        date: entry.date,
        amount,
        kind: 'recorded',
        runningNet: running,
        isLargest: entry.id === summary.largestEntryId,
      }
    })

    if (consistencyInvalid || !plan) return recorded

    let date = planStartDate(logged)
    const planned: ChartBar[] = buildPlan(inputs, plan).map((day, i) => {
      if (i > 0) date = nextTradingDate(date)
      return {
        key: `plan-${day.day}`,
        date,
        amount: day.profitNeeded,
        kind: 'planned',
        runningNet: day.cumulativeNetProfit,
        isLargest: false,
      }
    })

    return [...recorded, ...planned]
  }, [approach, sorted, summary, inputs, plan, consistencyInvalid])

  /** A template brings its rules, and its firm brings the theme. */
  function applyTemplate(id: string) {
    const next = accountTemplate(id)
    // A schedule is per account, so a new one starts on its current terms
    // and on its own buffer, which scales with its drawdown.
    const nextEra: Era = next.before ? era : 'current'
    const nextBuffer = defaultBuffer(next)
    setSetup((prev) => ({
      ...(prev ?? { approach, payoutTaken, strategy, curated }),
      templateId: next.id,
      era: nextEra,
      payoutsSoFar,
      payoutBuffer: nextBuffer,
    }))
    setRules((prev) => ({
      ...prev,
      ...rulesFor(next, nextEra, payoutsSoFar, nextBuffer),
      balance: prev.balance,
    }))
    appearance.setBrand(firmOf(next).themeId)
  }

  /**
   * The payout schedule decides the balance a max payout needs, so changing
   * where the trader is in it rewrites that rule.
   */
  function applySchedule(patch: {
    era?: Era
    payoutsSoFar?: number
    payoutBuffer?: number
  }) {
    const nextEra = patch.era ?? era
    const nextCount = patch.payoutsSoFar ?? payoutsSoFar
    const nextRoom = patch.payoutBuffer ?? payoutBuffer
    setSetup((prev) =>
      prev
        ? {
            ...prev,
            era: nextEra,
            payoutsSoFar: nextCount,
            payoutBuffer: nextRoom,
          }
        : prev,
    )
    setRules((prev) => ({
      ...prev,
      ...rulesFor(template, nextEra, nextCount, nextRoom),
      balance: prev.balance,
    }))
  }

  function finishWalkthrough(result: WalkthroughResult) {
    const next = accountTemplate(result.templateId)
    const taken = Math.max(0, Math.floor(parseAmount(result.payoutsSoFar)))
    const room = Math.max(0, parseAmount(result.payoutBuffer))
    setSetup({
      templateId: next.id,
      era: result.era,
      payoutsSoFar: taken,
      payoutBuffer: room,
      approach: result.approach,
      payoutTaken: result.payoutTaken,
      strategy: result.strategy,
      curated: result.curated,
    })
    setRules({
      ...accountFor(next, result.era, taken, room),
      // A balance only gets typed when the trader has one to give.
      balance:
        result.approach === 'pointInTime' || result.payoutTaken
          ? result.balance
          : String(next.startingBalance),
    })
    appearance.setBrand(firmOf(next).themeId)
    if (result.approach === 'pointInTime') {
      setSnapshot({
        largestProfitDay: result.largestProfitDay,
        netProfit: result.netProfit,
        tradingDays: result.tradingDays,
      })
    } else {
      setDays(result.days)
    }
    setReconfiguring(false)
    setDraftTemplate(null)
    brandBeforeDraft.current = null
    document.documentElement.scrollTop = 0
  }

  if (setup === null || reconfiguring) {
    // The header follows the account being picked, ahead of it being saved,
    // and says nothing until there is one.
    const shownId = draftTemplate ?? (setup ? templateId : '')
    const initial: SetupDraft = setup
      ? {
          firmId: firmOf(template).id,
          programId: template.programId,
          templateId,
          era,
          payoutsSoFar: String(payoutsSoFar),
          payoutBuffer: String(payoutBuffer),
          approach: setup.approach,
          payoutTaken: setup.approach === 'dayByDay' ? setup.payoutTaken : null,
          strategy,
          curated,
          balance: account.balance,
          largestProfitDay: snapshot.largestProfitDay,
          netProfit: snapshot.netProfit,
          tradingDays: snapshot.tradingDays,
          days,
        }
      : EMPTY_DRAFT
    return (
      <TooltipProvider delayDuration={200}>
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <AppHeader
            appearance={appearance}
            account={shownId ? templateLabel(accountTemplate(shownId)) : ''}
          />
          <Walkthrough
            initial={initial}
            onFinish={finishWalkthrough}
            onFirmChange={(id) => {
              // The firm screen shows the default theme; picking one moves
              // the whole app to that firm's colors on the spot.
              brandBeforeDraft.current ??= appearance.theme.id
              appearance.setBrand(firm(id).themeId)
            }}
            onAccountChange={(id) => setDraftTemplate(id || null)}
            onCancel={
              setup
                ? () => {
                    // Back out of the firm's theme as well as its rules.
                    if (brandBeforeDraft.current) {
                      appearance.setBrand(brandBeforeDraft.current)
                    }
                    brandBeforeDraft.current = null
                    setDraftTemplate(null)
                    setReconfiguring(false)
                  }
                : undefined
            }
          />
        </div>
      </TooltipProvider>
    )
  }

  const { title, detail } = verdict(
    results,
    plan,
    inputs.currentNetProfit,
    consistencyInvalid,
    curated,
    firmOf(template).name,
  )

  const balanceDisplay: BalanceDisplay = balanceEntered
    ? { kind: 'input' }
    : { kind: 'derived', value: inputs.balance }

  /** A sensible first curated plan: the conservative day count, in range. */
  function startingCurated(): CuratedDraft {
    if (fastest <= MAX_SPELLED_COUNT) {
      const start = Math.max(results.minimumTradingDaysLeft, fastest)
      return { ...curated, mode: 'days', days: Math.min(start, MAX_SPELLED_COUNT) }
    }
    return { ...curated, mode: 'cap', cap: results.maxAllowedSingleDay.toFixed(2) }
  }

  function chooseStrategy(next: Strategy) {
    const needsStart = next === 'curated' && !toCuratedChoice(curated)
    setSetup({
      ...setup!,
      strategy: next,
      curated: needsStart ? startingCurated() : curated,
    })
  }

  function clearDays() {
    const count = days.length
    const ok = window.confirm(
      `Clear all ${count} ${count === 1 ? 'day' : 'days'}? Do this once your payout is approved.`,
    )
    if (ok) setDays([])
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <AppHeader appearance={appearance} account={templateLabel(template)}>
          {/* Icon-only on phones so the app name keeps its two lines. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReconfiguring(true)}
          >
            <ArrowLeftRight />
            <span className="sr-only sm:not-sr-only">Change approach</span>
          </Button>
        </AppHeader>

        <main>
          <section aria-labelledby="verdict" className="pt-8 sm:pt-14">
            <h1
              id="verdict"
              className="font-display max-w-[20ch] text-[clamp(2.4rem,6.2vw,5rem)] leading-[0.95] text-balance"
            >
              {title}
            </h1>
            <p className="mt-5 max-w-[62ch] text-base text-muted-foreground sm:text-lg">
              {detail}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <span id="strategy-label" className="text-sm font-medium">
                Plan
              </span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={strategy}
                onValueChange={(value) => {
                  if (value) chooseStrategy(value as Strategy)
                }}
                aria-labelledby="strategy-label"
              >
                {STRATEGY_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className={SEGMENT}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {strategy === 'curated' &&
              !results.payoutReady &&
              !consistencyInvalid && (
                <CuratedControls
                  idPrefix="dashboard-curated"
                  value={curated}
                  fastest={fastest}
                  plan={plan}
                  onChange={(patch) =>
                    setSetup({ ...setup, curated: { ...curated, ...patch } })
                  }
                  className="mt-4 max-w-xl rounded-lg border bg-card p-4"
                />
              )}

            <PnlChart
              bars={bars}
              cap={consistencyInvalid ? 0 : shownPlan.dailyCap}
              className="mt-5 rounded-xl border bg-card px-2 pt-3 pb-4 sm:px-4"
            />
          </section>

          <div className="mt-14 grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
            {approach === 'dayByDay' ? (
              <Ledger
                entries={sorted}
                summary={summary}
                suggestedDate={suggestDate(sorted)}
                onAdd={(entry) =>
                  setDays((prev) => [...prev, { id: newId(), ...entry }])
                }
                onUpdate={(id, patch) =>
                  setDays((prev) =>
                    prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
                  )
                }
                onRemove={(id) =>
                  setDays((prev) => prev.filter((d) => d.id !== id))
                }
                onClear={clearDays}
              />
            ) : (
              <SnapshotPanel
                snapshot={snapshot}
                onSnapshotChange={(patch) =>
                  setSnapshot((prev) => ({ ...prev, ...patch }))
                }
              />
            )}

            <aside className="grid content-start gap-10">
              <AccountPanel
                templateId={templateId}
                onTemplateChange={applyTemplate}
                schedule={{
                  era,
                  payoutsSoFar: String(payoutsSoFar),
                  payoutBuffer: String(payoutBuffer),
                  onChange: (patch) =>
                    applySchedule({
                      era: patch.era,
                      payoutsSoFar:
                        patch.payoutsSoFar === undefined
                          ? undefined
                          : Math.max(
                              0,
                              Math.floor(parseAmount(patch.payoutsSoFar)),
                            ),
                      payoutBuffer:
                        patch.payoutBuffer === undefined
                          ? undefined
                          : Math.max(0, parseAmount(patch.payoutBuffer)),
                    }),
                }}
                values={account}
                onChange={(key, value) =>
                  setRules((prev) => ({ ...prev, [key]: value }))
                }
                onRestoreRules={() =>
                  setRules((prev) => ({
                    ...prev,
                    ...rulesFor(template, era, payoutsSoFar, payoutBuffer),
                  }))
                }
                consistencyInvalid={consistencyInvalid}
                balance={balanceDisplay}
                payoutTaken={
                  approach === 'dayByDay'
                    ? {
                        checked: balanceEntered,
                        onChange: (checked) =>
                          setSetup({ ...setup, payoutTaken: checked }),
                      }
                    : undefined
                }
              />
              <Separator />
              <TargetBreakdown
                inputs={inputs}
                results={results}
                plan={shownPlan}
                payout={
                  hasSchedule(template)
                    ? {
                        number: nextPayoutNumber(payoutsSoFar),
                        cap: payoutCap(schedule, payoutsSoFar),
                        repeats:
                          nextPayoutNumber(payoutsSoFar) >= schedule.caps.length,
                      }
                    : null
                }
                tradingDays={approach === 'dayByDay' ? summary.tradingDays : null}
                consistencyInvalid={consistencyInvalid}
              />
            </aside>
          </div>
        </main>

        <footer className="mt-20 border-t pt-5 text-sm text-muted-foreground">
          <p>Your entries are saved in this browser only.</p>
          <p className="mt-1">{DISCLAIMER}</p>
        </footer>
      </div>
    </TooltipProvider>
  )
}
