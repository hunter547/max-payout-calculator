import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Moon, Sun } from 'lucide-react'
import {
  AccountPanel,
  type AccountKey,
  type BalanceDisplay,
} from '@/components/AccountPanel'
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
import { BRAND_THEMES } from '@/lib/themes'

/** Account rules exactly as saved in the workbook. */
const RULE_DEFAULTS = {
  payoutBuffer: '2100',
  payoutCap: '2000',
  consistency: '50',
} satisfies Omit<Record<AccountKey, string>, 'balance'>

const ACCOUNT_DEFAULTS: Record<AccountKey, string> = {
  balance: '',
  ...RULE_DEFAULTS,
}

const SNAPSHOT_DEFAULTS: Snapshot = { largestProfitDay: '', netProfit: '' }

/** Every firm whose name and logo the app shows, for the footer disclaimer. */
const FIRMS = BRAND_THEMES.filter((t) => t.logo).map((t) => t.name)
const DISCLAIMER = `Not affiliated with or endorsed by ${
  FIRMS.length <= 2
    ? FIRMS.join(' or ')
    : `${FIRMS.slice(0, -1).join(', ')}, or ${FIRMS[FIRMS.length - 1]}`
}.`

const EMPTY_DRAFT: SetupDraft = {
  approach: null,
  payoutTaken: null,
  strategy: null,
  curated: CURATED_DEFAULT,
  balance: '',
  largestProfitDay: '',
  netProfit: '',
  days: [],
}

const STRATEGY_OPTIONS: { value: Strategy; label: string }[] = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'aggressive', label: 'Aggressive' },
  { value: 'curated', label: 'Curated' },
]

const SEGMENT =
  'px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

function verdict(
  results: CalcResults,
  plan: Plan | null,
  netProfit: number,
  consistencyInvalid: boolean,
  curated: CuratedDraft,
) {
  if (consistencyInvalid) {
    return {
      title: 'Set a consistency rule above 0%',
      detail:
        'The daily cap and the number of trading days both depend on it.',
    }
  }
  if (results.targetMet) {
    return {
      title: 'Payout target reached',
      detail: `Net profit of ${formatCurrency(netProfit)} clears the ${formatCurrency(results.minimumNetProfitRequired)} required.`,
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
  children,
}: {
  appearance: Appearance
  children?: ReactNode
}) {
  const nextScheme = appearance.scheme === 'dark' ? 'light' : 'dark'
  const logo = appearance.theme.logo
  return (
    <header className="flex items-center justify-between gap-4 py-5">
      <div className="leading-tight">
        {/* A firm theme leads with the firm's own logo instead of the subtitle. */}
        {logo && (
          <img src={logo.src} alt={logo.alt} className="mb-1.5 block h-5 w-auto" />
        )}
        <p className="font-expanded text-base font-bold">
          Max payout calculator
        </p>
        {!logo && (
          <p className="text-sm text-muted-foreground">
            MyFundedFutures 50k Builder
          </p>
        )}
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
  const [account, setAccount] = usePersistentState<Record<AccountKey, string>>(
    'mpc.account',
    ACCOUNT_DEFAULTS,
  )
  const [snapshot, setSnapshot] = usePersistentState<Snapshot>(
    'mpc.snapshot',
    SNAPSHOT_DEFAULTS,
  )
  const [days, setDays] = usePersistentState<DayEntry[]>('mpc.days', [])
  const [reconfiguring, setReconfiguring] = useState(false)

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

  function finishWalkthrough(result: WalkthroughResult) {
    setSetup({
      approach: result.approach,
      payoutTaken: result.payoutTaken,
      strategy: result.strategy,
      curated: result.curated,
    })
    if (result.approach === 'pointInTime' || result.payoutTaken) {
      setAccount((prev) => ({ ...prev, balance: result.balance }))
    }
    if (result.approach === 'pointInTime') {
      setSnapshot({
        largestProfitDay: result.largestProfitDay,
        netProfit: result.netProfit,
      })
    } else {
      setDays(result.days)
    }
    setReconfiguring(false)
    document.documentElement.scrollTop = 0
  }

  if (setup === null || reconfiguring) {
    const initial: SetupDraft = setup
      ? {
          approach: setup.approach,
          payoutTaken: setup.approach === 'dayByDay' ? setup.payoutTaken : null,
          strategy,
          curated,
          balance: account.balance,
          largestProfitDay: snapshot.largestProfitDay,
          netProfit: snapshot.netProfit,
          days,
        }
      : EMPTY_DRAFT
    return (
      <TooltipProvider delayDuration={200}>
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <AppHeader appearance={appearance} />
          <Walkthrough
            initial={initial}
            rules={account}
            onFinish={finishWalkthrough}
            onCancel={setup ? () => setReconfiguring(false) : undefined}
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
  )

  // Balance sits with the other lockable account settings in both approaches.
  const balanceDisplay: BalanceDisplay = balanceEntered
    ? { kind: 'input' }
    : { kind: 'derived', value: summary.netProfit }

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
        <AppHeader appearance={appearance}>
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
              !results.targetMet &&
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
                values={account}
                onChange={(key, value) =>
                  setAccount((prev) => ({ ...prev, [key]: value }))
                }
                onRestoreRules={() =>
                  setAccount((prev) => ({ ...prev, ...RULE_DEFAULTS }))
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
                results={results}
                plan={shownPlan}
                largestProfitDay={inputs.largestProfitDay}
                netProfit={inputs.currentNetProfit}
                tradingDays={approach === 'dayByDay' ? summary.tradingDays : null}
                consistency={consistency}
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
