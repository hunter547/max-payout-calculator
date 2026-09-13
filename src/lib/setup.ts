import {
  accountTemplate,
  DEFAULT_TEMPLATE,
  hasSchedule,
  sizesFor,
  type AccountKey,
  type Terms,
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
  /** Which of the account type's two sets of terms it is on. */
  terms?: Terms
  /** What `terms` was called before types had more than a cutoff to differ by. */
  era?: 'current' | 'before'
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
  /** Which of the account type's two sets of terms it is on. */
  terms: Terms
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
  draft: Pick<
    SetupDraft,
    'approach' | 'payoutTaken' | 'programId' | 'templateId' | 'payoutsSoFar'
  >,
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

  // Every account answers where it is in its payouts: as a count where the
  // schedule asks for one, and as a yes or no where it does not.
  if (!account.includes('payouts')) account.push('payout')

  // Before a payout the balance is where the account started plus the profit
  // since, whichever way that profit is given, so there is nothing to ask.
  const balance: StepId[] = hasTakenPayout(draft) ? ['balance'] : []

  if (draft.approach === 'dayByDay') {
    return [...account, 'approach', ...balance, 'days', 'strategy']
  }
  // Nothing to ask where the firm sets no minimum, or where its minimum is
  // one the consistency rule reaches on its own.
  const template = draft.templateId ? accountTemplate(draft.templateId) : null
  const days: StepId[] =
    template && tradingDaysBind(template.minTradingDays, template.consistency)
      ? ['tradingDays']
      : []

  return [
    ...account,
    'approach',
    ...balance,
    'largest',
    'cumulative',
    ...days,
    'strategy',
  ]
}

/**
 * Trading days the consistency rule forces on its own. At payout time no day
 * may top `consistency` of the net profit, and the net is at most the day
 * count times the largest day, so the count is at least 1 / consistency.
 */
export function impliedTradingDays(consistency: number): number {
  return consistency > 0 ? Math.ceil(1 / consistency - 1e-9) : 0
}

/**
 * Whether a firm's minimum trading days asks for more than the consistency
 * rule already forces. A MyFundedFutures Builder wants two days at 50%, which
 * takes two days anyway, so there is nothing to ask and nothing to hold a plan
 * back; a Tradeify Growth wants five at 35%, which takes three, so it binds.
 */
export function tradingDaysBind(
  minTradingDays: number,
  consistency: number,
): boolean {
  return minTradingDays > impliedTradingDays(consistency)
}

/** The terms a saved setup is on, reading what older saves called an era. */
export function termsOf(setup: Pick<Setup, 'terms' | 'era'>): Terms {
  return setup.terms ?? (setup.era === 'before' ? 'alt' : 'base')
}

/** Payouts already taken, as a number, from a draft's own typing. */
export function payoutsTaken(draft: Pick<SetupDraft, 'payoutsSoFar'>): number {
  return Math.max(0, Math.floor(parseAmount(draft.payoutsSoFar)))
}

/**
 * Whether a balance has to be typed rather than worked out from logged days:
 * once a payout has been taken, the days since it no longer add up to the
 * balance. The payout count answers it where the schedule screen asks for one.
 */
export function hasTakenPayout(
  draft: Pick<SetupDraft, 'payoutTaken' | 'templateId' | 'payoutsSoFar'>,
): boolean {
  return draft.templateId && hasSchedule(accountTemplate(draft.templateId))
    ? payoutsTaken(draft) > 0
    : draft.payoutTaken === true
}

/**
 * The calculator's inputs for either approach. Point-in-time uses the numbers
 * as typed; day-by-day derives largest day, net profit and the trading days
 * from the ledger.
 *
 * Either way, the balance is only asked for once a payout has been taken.
 * Before that it is where the account started plus the profit since, so asking
 * would be asking the same number twice — and on an account that starts at
 * zero, like a MyFundedFutures Builder, it is the same number exactly.
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
  /** The firm's own wording of its day rules, which the trader cannot edit. */
  dayRules: {
    qualifyingDayInclusive?: boolean
    minQualifyingDays?: number
  } = {},
): CalcInputs {
  const pointInTime = source.approach === 'pointInTime'
  const startingBalance = parseAmount(account.startingBalance)
  const consistency = parseAmount(account.consistency) / 100
  const minTradingDays = Math.max(
    0,
    Math.round(parseAmount(account.minTradingDays)),
  )

  const currentNetProfit = pointInTime
    ? parseAmount(source.netProfit)
    : summary.netProfit

  return {
    balance: source.payoutTaken
      ? parseAmount(source.balance)
      : startingBalance + currentNetProfit,
    payoutThreshold: parseAmount(account.payoutThreshold),
    minimumPayout: parseAmount(account.minimumPayout),
    profitGoal: Math.max(0, parseAmount(account.profitGoal)),
    largestProfitDay: pointInTime
      ? parseAmount(source.largestProfitDay)
      : summary.largestProfitDay,
    currentNetProfit,
    consistencyRequirement: consistency,
    minTradingDays,
    // Point-in-time asks for the days that count; day-by-day works out which
    // of the logged days clear the firm's bar. Where the minimum is one the
    // consistency rule reaches anyway, it is never asked for and never short.
    // Where a firm counts days twice over — so many in all, so many of them
    // over its bar — the total is what the minimum answers to, and the days
    // over the bar are counted separately below.
    tradingDaysSoFar: !pointInTime
      ? dayRules.minQualifyingDays !== undefined
        ? summary.tradingDays
        : summary.qualifyingDays
      : tradingDaysBind(minTradingDays, consistency)
        ? Math.max(0, Math.round(parseAmount(source.tradingDays)))
        : minTradingDays,
    qualifyingDayInclusive: dayRules.qualifyingDayInclusive,
    minQualifyingDays: dayRules.minQualifyingDays,
    qualifyingDaysSoFar: !pointInTime
      ? summary.qualifyingDays
      : tradingDaysBind(minTradingDays, consistency)
        ? Math.max(0, Math.round(parseAmount(source.tradingDays)))
        : minTradingDays,
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
 * setup. Treat it as day-by-day on the default account, which is how
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
