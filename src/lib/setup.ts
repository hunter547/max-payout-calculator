import {
  accountTemplate,
  DEFAULT_TEMPLATE,
  hasSchedule,
  sizesFor,
  type AccountKey,
  type Era,
} from '@/lib/accounts'
import {
  curatedPlan,
  planFor,
  type CalcInputs,
  type CalcResults,
  type CuratedChoice,
  type Plan,
  type Strategy,
} from '@/lib/calc'
import {
  isAmount,
  parseAmount,
  type DayEntry,
  type LedgerSummary,
} from '@/lib/ledger'

export type Approach = 'pointInTime' | 'dayByDay'

/** The curated plan as typed: a day count or a daily cap. */
export interface CuratedDraft {
  mode: 'days' | 'cap'
  days: number | null
  cap: string
}

export const CURATED_DEFAULT: CuratedDraft = { mode: 'days', days: null, cap: '' }

export interface Setup {
  /** The account template the rules came from. */
  templateId: string
  /** Which payout schedule the account is on; missing on older saves. */
  era?: Era
  /** Payouts already taken, which sets the next payout's cap. */
  payoutsSoFar?: number
  /** Payout buffer after a payout, where the floor breaches. */
  payoutBuffer?: number
  approach: Approach
  /** Day-by-day only: once a payout is taken, balance is entered, not derived. */
  payoutTaken: boolean
  /** Missing on setups saved before strategies existed; read as conservative. */
  strategy?: Strategy
  curated?: CuratedDraft
}

/** Point-in-time numbers, copied from the trader's account. */
export interface Snapshot {
  largestProfitDay: string
  netProfit: string
  /** Trading days already logged in this payout cycle. */
  tradingDays: string
}

/** What the walkthrough collects before anything is saved. */
export interface SetupDraft {
  /** The prop firm, picked before the account. Empty until chosen. */
  firmId: string
  /** The account type. Auto-filled when its firm offers only one. */
  programId: string
  /** The account size. Auto-filled when its type comes in only one. */
  templateId: string
  /** Which payout schedule the account is on. */
  era: Era
  /** Payouts already taken, as typed. */
  payoutsSoFar: string
  /** Payout buffer after a payout, as typed. */
  payoutBuffer: string
  approach: Approach | null
  payoutTaken: boolean | null
  strategy: Strategy | null
  curated: CuratedDraft
  balance: string
  largestProfitDay: string
  netProfit: string
  tradingDays: string
  days: DayEntry[]
}

export type StepId =
  | 'firm'
  | 'program'
  | 'size'
  | 'payouts'
  | 'approach'
  | 'payout'
  | 'balance'
  | 'largest'
  | 'cumulative'
  | 'tradingDays'
  | 'days'
  | 'strategy'

/** The balance hint, which depends on where the firm starts the account. */
export function balanceHint(templateId: string): string {
  const template = accountTemplate(templateId)
  return template.startingBalance > 0
    ? `Your account balance today. It starts at $${template.startingBalance.toLocaleString('en-US')}.`
    : 'Your funded account balance, which starts at $0.'
}

export function stepsFor(
  draft: Pick<SetupDraft, 'approach' | 'payoutTaken' | 'programId' | 'templateId'>,
): StepId[] {
  // A type that comes in one size has nothing to ask, so its screen is
  // dropped and the size is filled in with the type.
  const account: StepId[] =
    draft.programId && sizesFor(draft.programId).length < 2
      ? ['firm', 'program']
      : ['firm', 'program', 'size']

  // Only accounts whose payouts are graduated, or that changed terms on a
  // date, have a schedule to ask about. Any firm added later that does gets
  // this screen for free.
  if (draft.templateId && hasSchedule(accountTemplate(draft.templateId))) {
    account.push('payouts')
  }

  if (draft.approach === 'dayByDay') {
    return draft.payoutTaken
      ? [...account, 'approach', 'payout', 'balance', 'days', 'strategy']
      : [...account, 'approach', 'payout', 'days', 'strategy']
  }
  // A firm with no minimum has no trading days to ask about.
  const days: StepId[] =
    draft.templateId && accountTemplate(draft.templateId).minTradingDays > 0
      ? ['tradingDays']
      : []

  return [
    ...account,
    'approach',
    'balance',
    'largest',
    'cumulative',
    ...days,
    'strategy',
  ]
}

/**
 * The calculator's inputs for either approach. Point-in-time uses the numbers
 * as typed; day-by-day derives largest day, net profit, and the trading days
 * from the ledger, and before any payout the balance too, by adding the logged
 * days to where the account started.
 */
export function deriveInputs(
  source: {
    approach: Approach
    payoutTaken: boolean
    balance: string
    largestProfitDay: string
    netProfit: string
    tradingDays: string
  },
  summary: LedgerSummary,
  account: Record<AccountKey, string>,
): CalcInputs {
  const pointInTime = source.approach === 'pointInTime'
  const balanceEntered = pointInTime || source.payoutTaken
  const startingBalance = parseAmount(account.startingBalance)

  return {
    balance: balanceEntered
      ? parseAmount(source.balance)
      : startingBalance + summary.netProfit,
    payoutThreshold: parseAmount(account.payoutThreshold),
    minimumPayout: parseAmount(account.minimumPayout),
    profitGoal: Math.max(0, parseAmount(account.profitGoal)),
    largestProfitDay: pointInTime
      ? parseAmount(source.largestProfitDay)
      : summary.largestProfitDay,
    currentNetProfit: pointInTime
      ? parseAmount(source.netProfit)
      : summary.netProfit,
    consistencyRequirement: parseAmount(account.consistency) / 100,
    minTradingDays: Math.max(0, Math.round(parseAmount(account.minTradingDays))),
    // Point-in-time asks for the days that count; day-by-day works out which
    // of the logged days clear the firm's bar.
    tradingDaysSoFar: pointInTime
      ? Math.max(0, Math.round(parseAmount(source.tradingDays)))
      : summary.qualifyingDays,
    qualifyingDayProfit: Math.max(
      0,
      parseAmount(account.qualifyingDayProfit),
    ),
  }
}

/** The typed curated plan as a calculator choice, or null if incomplete. */
export function toCuratedChoice(draft: CuratedDraft): CuratedChoice | null {
  if (draft.mode === 'days') {
    return draft.days && draft.days > 0 ? { mode: 'days', days: draft.days } : null
  }
  const cap = parseAmount(draft.cap)
  return isAmount(draft.cap) && cap > 0 ? { mode: 'cap', cap } : null
}

/**
 * The plan for a strategy. Null for curated when the choice is incomplete or
 * its cap would take more than a year of trading days.
 */
export function resolvePlan(
  inputs: CalcInputs,
  results: CalcResults,
  strategy: Strategy,
  curated: CuratedDraft,
): Plan | null {
  if (strategy !== 'curated') return planFor(inputs, results, strategy)
  const choice = toCuratedChoice(curated)
  return choice ? curatedPlan(inputs, results, choice) : null
}

/**
 * Storage written before the walkthrough existed has logged days but no
 * setup. Treat it as day-by-day on the workbook's own account, which is how
 * that version worked, so returning users skip the walkthrough.
 */
export function legacySetup(): Setup | null {
  try {
    const raw = window.localStorage.getItem('mpc.days')
    const days: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(days) && days.length > 0
      ? {
          templateId: DEFAULT_TEMPLATE,
          approach: 'dayByDay',
          payoutTaken: true,
          strategy: 'conservative',
        }
      : null
  } catch {
    return null
  }
}
