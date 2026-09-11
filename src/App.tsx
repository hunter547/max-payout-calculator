import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeftRight, Moon, Sun } from 'lucide-react'
import {
  AccountPanel,
  type AccountKey,
  type BalanceDisplay,
} from '@/components/AccountPanel'
import { Ledger } from '@/components/Ledger'
import { PnlChart, type ChartBar } from '@/components/PnlChart'
import { SnapshotPanel } from '@/components/SnapshotPanel'
import { TargetBreakdown } from '@/components/TargetBreakdown'
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
import { usePersistentState, useTheme, type Theme } from '@/hooks'
import {
  buildPlan,
  calculate,
  planFor,
  type CalcResults,
  type Plan,
  type Strategy,
} from '@/lib/calc'
import { formatCurrency } from '@/lib/format'
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
  deriveInputs,
  legacySetup,
  type Setup,
  type SetupDraft,
  type Snapshot,
} from '@/lib/setup'

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

const EMPTY_DRAFT: SetupDraft = {
  approach: null,
  payoutTaken: null,
  strategy: null,
  balance: '',
  largestProfitDay: '',
  netProfit: '',
  days: [],
}

const COUNT_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
]

function countWord(n: number): string {
  const word = n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n)
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function verdict(
  results: CalcResults,
  plan: Plan,
  netProfit: number,
  consistencyInvalid: boolean,
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
  const days = plan.days
  const daily = formatCurrency(plan.dailyProfit)
  const from = formatCurrency(netProfit)
  const to = formatCurrency(plan.requiredProfit)
  return {
    title:
      days === 1
        ? `One more trading day at ${daily}`
        : `${countWord(days)} more trading days at ${daily} each`,
    detail: plan.raisesTarget
      ? `That takes net profit from ${from} to ${to}. Days that size lift the profit target from ${formatCurrency(results.minimumNetProfitRequired)} to ${to}, and the plan already counts that.`
      : `That takes net profit from ${from} to ${to}. Keep each day at or under ${formatCurrency(plan.dailyCap)}; a bigger day raises the target.`,
  }
}

function AppHeader({
  theme,
  onToggleTheme,
  children,
}: {
  theme: Theme
  onToggleTheme: () => void
  children?: ReactNode
}) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return (
    <header className="flex items-center justify-between gap-4 py-5">
      <div className="leading-tight">
        <p className="font-expanded text-base font-bold">
          Max payout calculator
        </p>
        <p className="text-sm text-muted-foreground">
          MyFundedFutures 50k Builder
        </p>
      </div>
      <div className="flex items-center gap-1">
        {children}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Switch to ${nextTheme} theme`}
              onClick={onToggleTheme}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Switch to {nextTheme} theme</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

export default function App() {
  const [theme, setTheme] = useTheme()
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
  const plan = useMemo(
    () => planFor(inputs, results, strategy),
    [inputs, results, strategy],
  )

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

    if (consistencyInvalid) return recorded

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

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  function finishWalkthrough(result: WalkthroughResult) {
    setSetup({
      approach: result.approach,
      payoutTaken: result.payoutTaken,
      strategy: result.strategy,
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
          balance: account.balance,
          largestProfitDay: snapshot.largestProfitDay,
          netProfit: snapshot.netProfit,
          days,
        }
      : EMPTY_DRAFT
    return (
      <TooltipProvider delayDuration={200}>
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <AppHeader theme={theme} onToggleTheme={toggleTheme} />
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
  )

  const balanceDisplay: BalanceDisplay =
    approach === 'pointInTime'
      ? { kind: 'hidden' }
      : balanceEntered
        ? { kind: 'input' }
        : { kind: 'derived', value: summary.netProfit }

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
        <AppHeader theme={theme} onToggleTheme={toggleTheme}>
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
                  if (value) setSetup({ ...setup, strategy: value as Strategy })
                }}
                aria-labelledby="strategy-label"
              >
                <ToggleGroupItem
                  value="conservative"
                  className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  Conservative
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="aggressive"
                  className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  Aggressive
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <PnlChart
              bars={bars}
              cap={consistencyInvalid ? 0 : plan.dailyCap}
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
                balance={account.balance}
                snapshot={snapshot}
                onBalanceChange={(v) =>
                  setAccount((prev) => ({ ...prev, balance: v }))
                }
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
                plan={plan}
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
          Calculations match{' '}
          <span className="text-foreground">
            MyFundedFutrures 50k Builder Max Payout Calculator.xlsx
          </span>
          . Your entries are saved in this browser only.
        </footer>
      </div>
    </TooltipProvider>
  )
}
