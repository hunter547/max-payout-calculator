import { useMemo } from 'react'
import { Moon, Sun } from 'lucide-react'
import { AccountPanel, type AccountKey } from '@/components/AccountPanel'
import { Ledger } from '@/components/Ledger'
import { PnlChart, type ChartBar } from '@/components/PnlChart'
import { TargetBreakdown } from '@/components/TargetBreakdown'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePersistentState, useTheme } from '@/hooks'
import {
  buildPlan,
  calculate,
  type CalcInputs,
  type CalcResults,
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
  type LedgerSummary,
} from '@/lib/ledger'

/** Account settings exactly as saved in the workbook. */
const ACCOUNT_DEFAULTS: Record<AccountKey, string> = {
  balance: '4758.34',
  payoutBuffer: '2100',
  payoutCap: '2000',
  consistency: '50',
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
  summary: LedgerSummary,
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
      detail: `Net profit of ${formatCurrency(summary.netProfit)} clears the ${formatCurrency(results.minimumNetProfitRequired)} required.`,
    }
  }
  const days = results.minimumTradingDaysLeft
  const daily = formatCurrency(results.dailyProfitNeeded)
  return {
    title:
      days === 1
        ? `One more trading day at ${daily}`
        : `${countWord(days)} more trading days at ${daily} each`,
    detail: `That takes net profit from ${formatCurrency(summary.netProfit)} to ${formatCurrency(results.minimumNetProfitRequired)}. Keep each day at or under ${formatCurrency(results.maxAllowedSingleDay)}; a bigger day raises the target.`,
  }
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const [account, setAccount] = usePersistentState<Record<AccountKey, string>>(
    'mpc.account',
    ACCOUNT_DEFAULTS,
  )
  const [days, setDays] = usePersistentState<DayEntry[]>('mpc.days', [])

  const sorted = useMemo(() => sortByDate(days), [days])
  const summary = useMemo(() => summarize(sorted), [sorted])
  const consistency = parseAmount(account.consistency) / 100
  const consistencyInvalid = consistency <= 0

  const inputs = useMemo<CalcInputs>(
    () => ({
      balance: parseAmount(account.balance),
      payoutBuffer: parseAmount(account.payoutBuffer),
      payoutCap: parseAmount(account.payoutCap),
      largestProfitDay: summary.largestProfitDay,
      currentNetProfit: summary.netProfit,
      consistencyRequirement: consistency,
    }),
    [account, summary, consistency],
  )

  const results = useMemo(() => calculate(inputs), [inputs])

  const bars = useMemo<ChartBar[]>(() => {
    let running = 0
    const recorded: ChartBar[] = sorted.map((entry) => {
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

    let date = planStartDate(sorted)
    const planned: ChartBar[] = buildPlan(inputs, results).map((day, i) => {
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
  }, [sorted, summary, inputs, results, consistencyInvalid])

  const { title, detail } = verdict(results, summary, consistencyInvalid)
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

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
        <header className="flex items-center justify-between gap-4 py-5">
          <div className="leading-tight">
            <p className="font-expanded text-base font-bold">
              Max payout calculator
            </p>
            <p className="text-sm text-muted-foreground">
              MyFundedFutures 50k Builder
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Switch to ${nextTheme} theme`}
                onClick={() => setTheme(nextTheme)}
              >
                {theme === 'dark' ? <Sun /> : <Moon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch to {nextTheme} theme</TooltipContent>
          </Tooltip>
        </header>

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

            <PnlChart
              bars={bars}
              cap={consistencyInvalid ? 0 : results.maxAllowedSingleDay}
              className="mt-10 rounded-xl border bg-card px-2 pt-3 pb-4 sm:px-4"
            />
          </section>

          <div className="mt-14 grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
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

            <aside className="grid content-start gap-10">
              <AccountPanel
                values={account}
                onChange={(key, value) =>
                  setAccount((prev) => ({ ...prev, [key]: value }))
                }
                onReset={() => setAccount(ACCOUNT_DEFAULTS)}
                consistencyInvalid={consistencyInvalid}
              />
              <Separator />
              <TargetBreakdown
                results={results}
                summary={summary}
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
