/**
 * The daily P&L ledger since the last payout. It derives the two spreadsheet
 * inputs the trader used to type by hand:
 *   largest profit day -> largestProfitDay
 *   cumulative profit  -> netProfit
 */

export interface DayEntry {
  id: string
  /** ISO date, YYYY-MM-DD. */
  date: string
  /** Raw text from the input so partial entries like "-" survive editing. */
  amount: string
}

export interface LedgerSummary {
  /** Biggest winning day; 0 until there is at least one winner. */
  largestProfitDay: number
  /** Id of the entry that set largestProfitDay, if any. */
  largestEntryId: string | null
  /** Sum of every day, losses included. */
  netProfit: number
  tradingDays: number
  /**
   * Days that count towards a firm's minimum: every logged day where the firm
   * sets no profit bar, and only the days that clear it where it does.
   */
  qualifyingDays: number
  winningDays: number
  losingDays: number
}

/** Strip the formatting people paste in: "$1,200", "− 50". */
export function normalizeAmount(raw: string): string {
  return raw.replace(/[\s$,]/g, '').replace(/−/g, '-')
}

export function isAmount(raw: string): boolean {
  const clean = normalizeAmount(raw)
  return clean !== '' && clean !== '-' && Number.isFinite(Number(clean))
}

export function parseAmount(raw: string): number {
  const parsed = Number.parseFloat(normalizeAmount(raw))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Whether a day counts towards the firm's minimum trading days.
 *
 * Firms word the bar differently: Tradeify wants more than its figure, Apex
 * wants that figure "or more", so a day landing exactly on it counts for one
 * and not the other.
 */
export function dayQualifies(
  amount: number,
  qualifyingProfit: number,
  inclusive = false,
): boolean {
  if (qualifyingProfit <= 0) return true
  return inclusive ? amount >= qualifyingProfit : amount > qualifyingProfit
}

export function summarize(
  entries: DayEntry[],
  qualifyingProfit = 0,
  inclusive = false,
): LedgerSummary {
  let largestProfitDay = 0
  let largestEntryId: string | null = null
  let netProfit = 0
  let winningDays = 0
  let losingDays = 0
  let qualifyingDays = 0

  for (const entry of entries) {
    const amount = parseAmount(entry.amount)
    netProfit += amount
    if (amount > 0) winningDays++
    if (amount < 0) losingDays++
    if (dayQualifies(amount, qualifyingProfit, inclusive)) qualifyingDays++
    if (amount > largestProfitDay) {
      largestProfitDay = amount
      largestEntryId = entry.id
    }
  }

  return {
    largestProfitDay,
    largestEntryId,
    // Keep cents clean: 359 - 212.4 - 140 should read 6.6, not 6.599999999.
    netProfit: Math.round(netProfit * 100) / 100,
    tradingDays: entries.length,
    qualifyingDays,
    winningDays,
    losingDays,
  }
}

function toISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isWeekend(iso: string): boolean {
  const day = fromISO(iso).getDay()
  return day === 0 || day === 6
}

/** The next weekday after `iso` — futures sessions don't settle on weekends. */
export function nextTradingDate(iso: string): string {
  const date = fromISO(iso)
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() === 0 || date.getDay() === 6)
  return toISO(date)
}

export function todayISO(): string {
  return toISO(new Date())
}

function latestDate(entries: DayEntry[]): string {
  return entries.reduce((a, b) => (a.date > b.date ? a : b)).date
}

/** Default date for a new row: the day after the latest entry, else today. */
export function suggestDate(entries: DayEntry[]): string {
  if (entries.length === 0) return todayISO()
  return nextTradingDate(latestDate(entries))
}

/**
 * First date of the projected plan: the trading day after the latest entry,
 * but never in the past, and never on a weekend.
 */
export function planStartDate(
  entries: DayEntry[],
  today: string = todayISO(),
): string {
  const afterLatest =
    entries.length > 0 ? nextTradingDate(latestDate(entries)) : today
  const start = afterLatest > today ? afterLatest : today
  return isWeekend(start) ? nextTradingDate(start) : start
}

export function sortByDate(entries: DayEntry[]): DayEntry[] {
  return [...entries].sort((a, b) =>
    a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
  )
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
