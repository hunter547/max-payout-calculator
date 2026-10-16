import { useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, TriangleAlert } from 'lucide-react'
import { FirmIcon } from '@/components/FirmIcon'
import { MoneyField } from '@/components/MoneyField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { firm, FIRMS } from '@/lib/accounts'
import {
  SECTORS,
  feeSchedule,
  firmContracts,
  formatMove,
  isStale,
  offered,
  type Offered,
} from '@/lib/contracts'
import { formatCurrency, formatLongDate } from '@/lib/format'
import { parseAmount, todayISO } from '@/lib/ledger'
import type { TradePrefs } from '@/lib/portfolio'
import { ticksNeeded, type Aim } from '@/lib/ticks'

const SEGMENT =
  'px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'
const AMOUNT = 'h-auto flex-1 flex-col gap-0 self-stretch py-1.5'

/** "Tradeify’s", "MyFundedFutures’". */
function possessive(name: string): string {
  return name.endsWith('s') ? `${name}’` : `${name}’s`
}

/** The two edges of the chart's consistency corridor. */
export interface Corridor {
  /** The plan's daily profit: a day has to make at least this. */
  low: number
  /** The daily cap: a day that makes more raises the payout target. */
  high: number
}

type Amount = 'low' | 'high' | 'custom'

interface TradeCalculatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The open account's firm, which the calculator starts on. */
  firmId: string
  /** Null when there is no plan to trade to: only a custom amount then. */
  corridor: Corridor | null
  prefs: TradePrefs
  /** Saves choices made on the account's own firm, and only those. */
  onPrefsChange: (patch: TradePrefs) => void
}

export function TradeCalculator({
  open,
  onOpenChange,
  ...props
}: TradeCalculatorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-expanded">Ticks to target</DialogTitle>
          <DialogDescription>
            How far a trade has to run to make an amount, once the firm’s
            fees and your slippage are paid.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per opening, so it starts on the account's firm each time. */}
        {open && <CalculatorBody {...props} />}
      </DialogContent>
    </Dialog>
  )
}

/** The first contract in the list that can be traded today. */
function fallback(list: Offered[]): Offered | undefined {
  return list.find((o) => !o.restricted) ?? list[0]
}

function CalculatorBody({
  firmId: accountFirmId,
  corridor,
  prefs,
  onPrefsChange,
}: Omit<TradeCalculatorProps, 'open' | 'onOpenChange'>) {
  const [firmId, setFirmId] = useState(accountFirmId)
  const onOwnFirm = firmId === accountFirmId
  // Another firm is a look around, not a change to this account's setup.
  const [elsewhere, setElsewhere] = useState<TradePrefs>({})
  const current: TradePrefs = onOwnFirm ? prefs : elsewhere
  const update = (patch: TradePrefs) =>
    onOwnFirm ? onPrefsChange(patch) : setElsewhere((p) => ({ ...p, ...patch }))

  const [amountChoice, setAmountChoice] = useState<Amount>(
    corridor ? 'low' : 'custom',
  )
  const [custom, setCustom] = useState('')

  const fees = firmContracts(firmId)
  const schedule = fees ? feeSchedule(fees, current.platform) : undefined
  const list = useMemo(
    () => (fees && schedule ? offered(fees, schedule) : []),
    [fees, schedule],
  )
  const saved = list.find((o) => o.contract.symbol === current.symbol)
  const pick = saved && !saved.restricted ? saved : fallback(list)

  const quantityText = current.quantity ?? '1'
  const slippageText = current.slippage ?? '1'
  const quantity = Number(quantityText)
  const slippage = slippageText.trim() === '' ? 0 : Number(slippageText)
  const quantityError =
    Number.isInteger(quantity) && quantity >= 1
      ? null
      : 'A whole number of contracts, 1 or more.'
  const slippageError =
    Number.isFinite(slippage) && slippage >= 0 ? null : 'Zero or more ticks.'

  const amount =
    amountChoice === 'low' && corridor
      ? corridor.low
      : amountChoice === 'high' && corridor
        ? corridor.high
        : parseAmount(custom)
  // Only the cap is a ceiling; the minimum and a custom amount are to reach.
  const aim: Aim = amountChoice === 'high' && corridor ? 'stayUnder' : 'reach'

  const result =
    pick && !quantityError && !slippageError
      ? ticksNeeded(
          amount,
          pick.contract,
          { quantity, roundTripFee: pick.roundTripFee, slippageTicks: slippage },
          aim,
        )
      : null
  // What one tick more would net, to show why the cap rounds down.
  const oneMore =
    result && pick && aim === 'stayUnder'
      ? result.net + quantity * pick.contract.tickValue
      : null

  const platforms = fees?.schedules.flatMap((s) => (s.platform ? [s.platform] : [])) ?? []
  // A firm with a page per platform is cited by the page for this one.
  const sources =
    fees?.sources.filter(
      (s) => !s.platform || s.platform === schedule?.platform?.id,
    ) ?? []
  const firmName = firm(firmId).name
  // The fee check confirms these daily; an old date means it has been failing.
  const stale = fees ? isStale(fees.checked, todayISO()) : false

  // Both menus stay modal. Their lists render outside the dialog, and the
  // dialog blocks scrolling outside itself, so a non-modal list cannot be
  // scrolled by touch or wheel; a modal menu takes the scroll lock over.
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label id="calc-firm-label">Prop firm</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                aria-labelledby="calc-firm-label"
                className="justify-between gap-3 font-normal"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FirmIcon firmId={firmId} size={18} />
                  <span className="truncate">{firmName}</span>
                </span>
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuRadioGroup value={firmId} onValueChange={setFirmId}>
                {FIRMS.map((f) => (
                  <DropdownMenuRadioItem key={f.id} value={f.id}>
                    <FirmIcon firmId={f.id} size={16} />
                    {f.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid content-start gap-1.5">
          <Label id="calc-contract-label">Contract</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                aria-labelledby="calc-contract-label"
                disabled={list.length === 0}
                className="justify-between gap-3 font-normal"
              >
                <span className="truncate">
                  {pick ? (
                    <>
                      <span className="font-medium">{pick.contract.symbol}</span>{' '}
                      <span className="text-muted-foreground">
                        {pick.contract.name}
                      </span>
                    </>
                  ) : (
                    'No contracts'
                  )}
                </span>
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-80 overflow-y-auto"
            >
              <DropdownMenuRadioGroup
                value={pick?.contract.symbol ?? ''}
                onValueChange={(symbol) => update({ symbol })}
              >
                {/* A group per sector, in the registry's most-traded order. */}
                {SECTORS.map((sector) => ({
                  sector,
                  items: list.filter((o) => o.contract.sector === sector.id),
                }))
                  .filter((g) => g.items.length > 0)
                  .map((g, i) => (
                    <div key={g.sector.id}>
                      {i > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel>{g.sector.name}</DropdownMenuLabel>
                      {g.items.map((o) => (
                        <DropdownMenuRadioItem
                          key={o.contract.symbol}
                          value={o.contract.symbol}
                          disabled={Boolean(o.restricted)}
                          className="gap-3"
                        >
                          <span className="w-10 font-medium">{o.contract.symbol}</span>
                          <span className="flex-1 truncate">
                            {o.contract.name}
                            {o.restricted && (
                              <span className="block text-xs">{o.restricted}</span>
                            )}
                          </span>
                          <span className="font-figure text-xs text-muted-foreground">
                            {formatCurrency(o.roundTripFee)}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </div>
                  ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {platforms.length > 1 && schedule?.platform && (
        <div className="grid gap-1.5">
          <span id="calc-platform-label" className="text-sm font-medium">
            Platform
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={schedule.platform.id}
            onValueChange={(platform) => {
              if (platform) update({ platform })
            }}
            aria-labelledby="calc-platform-label"
            className="justify-start"
          >
            {platforms.map((p) => (
              <ToggleGroupItem key={p.id} value={p.id} className={SEGMENT}>
                {p.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            {firmName} charges differently on each. NinjaTrader pays whichever
            of Rithmic or Tradovate it connects through.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          id="calc-quantity"
          label="Quantity"
          unit="contracts"
          value={quantityText}
          onChange={(quantity) => update({ quantity })}
          error={quantityError}
        />
        <MoneyField
          id="calc-slippage"
          label="Slippage"
          unit="ticks"
          value={slippageText}
          onChange={(slippage) => update({ slippage })}
          error={slippageError}
          hint="Total ticks lost per contract, entry and exit together: 1 for one tick in all, 2 for a tick on each side."
        />
      </div>

      <div className="grid gap-2">
        <span id="calc-amount-label" className="text-sm font-medium">
          Profit to make
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={amountChoice}
          onValueChange={(value) => {
            if (value) setAmountChoice(value as Amount)
          }}
          aria-labelledby="calc-amount-label"
          className="w-full"
        >
          {/* Label over figure, so all three fit across a phone. */}
          {corridor && (
            <>
              <ToggleGroupItem value="low" className={`${SEGMENT} ${AMOUNT}`}>
                Minimum{' '}
                <span className="font-figure">{formatCurrency(corridor.low)}</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="high" className={`${SEGMENT} ${AMOUNT}`}>
                Cap{' '}
                <span className="font-figure">{formatCurrency(corridor.high)}</span>
              </ToggleGroupItem>
            </>
          )}
          <ToggleGroupItem value="custom" className={`${SEGMENT} ${AMOUNT}`}>
            Custom
          </ToggleGroupItem>
        </ToggleGroup>
        {corridor ? (
          <p className="text-xs text-muted-foreground">
            The minimum and the cap are the two edges of the consistency
            corridor: the least a day of your plan needs, and the most it can
            make before the payout target rises.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            There is no plan to trade to right now, so name an amount.
          </p>
        )}
        {amountChoice === 'custom' && (
          <MoneyField
            id="calc-custom"
            label="Custom amount"
            hideLabel
            value={custom}
            onChange={setCustom}
          />
        )}
      </div>

      <section
        aria-labelledby="calc-result"
        aria-live="polite"
        className="rounded-lg border bg-card p-4"
      >
        <h3 id="calc-result" className="sr-only">
          Result
        </h3>
        {result && pick ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-display text-4xl">
                {result.ticks} {result.ticks === 1 ? 'tick' : 'ticks'}
              </span>
              <span className="font-figure text-lg text-muted-foreground">
                {formatMove(pick.contract, result.ticks)}
              </span>
            </p>
            <dl className="font-figure mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">
                Gross, {quantity} × {result.ticks} ×{' '}
                {formatCurrency(pick.contract.tickValue)}
              </dt>
              <dd className="text-right">{formatCurrency(result.gross)}</dd>
              <dt className="text-muted-foreground">
                Fees, {quantity} × {formatCurrency(pick.roundTripFee)} round trip
              </dt>
              <dd className="text-right">−{formatCurrency(result.fees)}</dd>
              <dt className="text-muted-foreground">
                Slippage, {quantity} × {slippage}{' '}
                {slippage === 1 ? 'tick' : 'ticks'}
              </dt>
              <dd className="text-right">−{formatCurrency(result.slippage)}</dd>
              <dt className="font-medium">Net</dt>
              <dd className="text-right font-medium">{formatCurrency(result.net)}</dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {aim === 'reach'
                ? `Rounded up to a whole tick, so the trade reaches ${formatCurrency(amount)}.`
                : `Rounded down to a whole tick: one more would net ${formatCurrency(oneMore ?? 0)}, over the cap, and raise the payout target.`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {!pick
              ? `No fees published for ${firmName} on this platform.`
              : quantityError || slippageError
                ? 'Fix the fields above to see the ticks.'
                : aim === 'stayUnder' && amount > 0
                  ? `A ${formatCurrency(amount)} cap is less than one tick on ${quantity} ${pick.contract.symbol} once fees and slippage are paid.`
                  : 'Enter an amount to make.'}
          </p>
        )}
      </section>

      {fees && (
        <p
          className={
            stale ? 'text-xs text-foreground' : 'text-xs text-muted-foreground'
          }
        >
          {stale && (
            <TriangleAlert
              className="mr-1 inline size-3.5 align-[-0.15em] text-destructive"
              aria-hidden
            />
          )}
          Fees are {possessive(firmName)}
          {schedule?.platform ? ` ${schedule.platform.name}` : ''} round trip per
          contract{fees.quoted === 'perSide' ? ', twice its published per-side fee' : ''},
          {stale
            ? ` last confirmed ${formatLongDate(fees.checked)}, over two weeks ago. They may have changed since; check `
            : ` checked ${formatLongDate(fees.checked)}. Firms reprice often; check `}
          {sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && (i === sources.length - 1 ? ' and ' : ', ')}
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2"
              >
                {s.title}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </span>
          ))}{' '}
          before relying on it.
        </p>
      )}
    </div>
  )
}
