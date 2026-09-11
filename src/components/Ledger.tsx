import { useRef, useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  formatCurrency,
  formatShortDate,
  formatSignedCurrency,
} from '@/lib/format'
import {
  isAmount,
  nextTradingDate,
  normalizeAmount,
  parseAmount,
  type DayEntry,
  type LedgerSummary,
} from '@/lib/ledger'
import { cn } from '@/lib/utils'

interface LedgerProps {
  /** Already sorted by date. */
  entries: DayEntry[]
  summary: LedgerSummary
  suggestedDate: string
  onAdd: (entry: { date: string; amount: string }) => void
  onUpdate: (id: string, patch: Partial<Omit<DayEntry, 'id'>>) => void
  onRemove: (id: string) => void
  onClear: () => void
}

const INLINE_INPUT =
  'h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input dark:bg-transparent'

/** The native picker icon on every row is noise; show it on hover or focus. */
const QUIET_PICKER =
  '[&::-webkit-calendar-picker-indicator]:opacity-0 group-hover/row:[&::-webkit-calendar-picker-indicator]:opacity-60 focus:[&::-webkit-calendar-picker-indicator]:opacity-100'

/** "359" -> "359.00", so the column reads consistently once you move on. */
function tidyAmount(raw: string): string {
  return Number(normalizeAmount(raw)).toFixed(2)
}

export function Ledger({
  entries,
  summary,
  suggestedDate,
  onAdd,
  onUpdate,
  onRemove,
  onClear,
}: LedgerProps) {
  const [date, setDate] = useState(suggestedDate)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!date) {
      setError('Pick the trading date.')
      return
    }
    if (!isAmount(amount)) {
      setError('Enter the day’s profit or loss, like 250 or -120.50.')
      return
    }
    onAdd({ date, amount: tidyAmount(amount) })
    setAmount('')
    setError(null)
    setDate(nextTradingDate(date))
    amountRef.current?.focus()
  }

  let running = 0

  return (
    <section aria-labelledby="ledger-heading" className="min-w-0">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="ledger-heading" className="font-expanded text-xl font-bold">
          Days since last payout
        </h2>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Start a new cycle
          </Button>
        )}
      </div>
      <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
        Log each trading day’s P&L. Your largest day and net profit update from
        these entries.
      </p>

      <form
        onSubmit={submit}
        noValidate
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="new-date">Date</Label>
          <Input
            id="new-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label htmlFor="new-amount">P&L</Label>
          <Input
            id="new-amount"
            ref={amountRef}
            inputMode="decimal"
            autoComplete="off"
            placeholder="250 or -120.50"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'new-amount-error' : undefined}
            className="font-figure"
          />
        </div>
        <Button type="submit">
          <Plus />
          Add day
        </Button>
      </form>
      {error && (
        <p id="new-amount-error" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <div className="mt-6 border-t border-dashed pt-6">
          <p className="font-medium">No trading days yet</p>
          <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
            Add every day since your last payout, losing days too. The plan
            above is built from your account settings until then.
          </p>
        </div>
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3 text-muted-foreground">Date</TableHead>
              <TableHead className="text-right text-muted-foreground">
                P&L
              </TableHead>
              <TableHead className="hidden text-right text-muted-foreground sm:table-cell">
                Net after
              </TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Remove</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const value = parseAmount(entry.amount)
              running += value
              const label = formatShortDate(entry.date)
              const isLargest = entry.id === summary.largestEntryId
              return (
                <TableRow key={entry.id} className="group/row">
                  <TableCell className="pl-0">
                    {/* On a phone the badge wraps under the date so the
                        P&L column keeps its room. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'h-5 w-1 shrink-0 rounded-full',
                            value > 0
                              ? 'bg-profit'
                              : value < 0
                                ? 'bg-loss'
                                : 'bg-border',
                          )}
                        />
                        <Input
                          type="date"
                          value={entry.date}
                          aria-label={`Date of ${label}`}
                          onChange={(e) =>
                            onUpdate(entry.id, { date: e.target.value })
                          }
                          className={cn(INLINE_INPUT, QUIET_PICKER, 'w-36')}
                        />
                      </div>
                      {isLargest && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" tabIndex={0}>
                              Largest day
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-60">
                            Under the consistency rule, this day sets how much
                            net profit you need.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      value={entry.amount}
                      aria-label={`P&L on ${label}`}
                      aria-invalid={isAmount(entry.amount) ? undefined : true}
                      onChange={(e) =>
                        onUpdate(entry.id, { amount: e.target.value })
                      }
                      onBlur={() => {
                        if (!isAmount(entry.amount)) return
                        const tidy = tidyAmount(entry.amount)
                        if (tidy !== entry.amount) {
                          onUpdate(entry.id, { amount: tidy })
                        }
                      }}
                      className={cn(
                        INLINE_INPUT,
                        'ml-auto w-24 text-right font-figure font-semibold sm:w-28',
                      )}
                    />
                  </TableCell>
                  <TableCell className="hidden text-right font-figure text-muted-foreground sm:table-cell">
                    {formatCurrency(running)}
                  </TableCell>
                  <TableCell className="pr-0 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${label}`}
                      onClick={() => onRemove(entry.id)}
                    >
                      <X />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter className="bg-transparent">
            <TableRow className="hover:bg-transparent">
              <TableCell className="pl-3 font-medium">
                Net profit, {summary.tradingDays}{' '}
                {summary.tradingDays === 1 ? 'day' : 'days'}
              </TableCell>
              <TableCell className="pr-4 text-right font-figure text-base font-bold">
                {formatSignedCurrency(summary.netProfit)}
              </TableCell>
              <TableCell className="hidden sm:table-cell" />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </section>
  )
}
