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
}

/** Account rules, as typed. */
export interface Rules {
  payoutBuffer: string
  payoutCap: string
  consistency: string
}

/** What the walkthrough collects before anything is saved. */
export interface SetupDraft {
  approach: Approach | null
  payoutTaken: boolean | null
  strategy: Strategy | null
  curated: CuratedDraft
  balance: string
  largestProfitDay: string
  netProfit: string
  days: DayEntry[]
}

export type StepId =
  | 'approach'
  | 'payout'
  | 'balance'
  | 'largest'
  | 'cumulative'
  | 'days'
  | 'strategy'

/** A funded account's balance starts at $0, which is what the formula expects. */
export const BALANCE_HINT = 'Your funded account balance, which starts at $0.'

export function stepsFor(
  draft: Pick<SetupDraft, 'approach' | 'payoutTaken'>,
): StepId[] {
  if (draft.approach === 'dayByDay') {
    return draft.payoutTaken
      ? ['approach', 'payout', 'balance', 'days', 'strategy']
      : ['approach', 'payout', 'days', 'strategy']
  }
  return ['approach', 'balance', 'largest', 'cumulative', 'strategy']
}

/**
 * The calculator's inputs for either approach. Point-in-time uses the numbers
 * as typed; day-by-day derives largest day and net profit from the ledger,
 * and before any payout, the balance too.
 */
export function deriveInputs(
  source: {
    approach: Approach
    payoutTaken: boolean
    balance: string
    largestProfitDay: string
    netProfit: string
  },
  summary: LedgerSummary,
  rules: Rules,
): CalcInputs {
  const pointInTime = source.approach === 'pointInTime'
  const balanceEntered = pointInTime || source.payoutTaken
  return {
    // Before any payout, the balance since funding is everything logged.
    balance: balanceEntered ? parseAmount(source.balance) : summary.netProfit,
    payoutBuffer: parseAmount(rules.payoutBuffer),
    payoutCap: parseAmount(rules.payoutCap),
    largestProfitDay: pointInTime
      ? parseAmount(source.largestProfitDay)
      : summary.largestProfitDay,
    currentNetProfit: pointInTime
      ? parseAmount(source.netProfit)
      : summary.netProfit,
    consistencyRequirement: parseAmount(rules.consistency) / 100,
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
 * setup. Treat it as day-by-day with an entered balance, which is how that
 * version worked, so returning users skip the walkthrough.
 */
export function legacySetup(): Setup | null {
  try {
    const raw = window.localStorage.getItem('mpc.days')
    const days: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(days) && days.length > 0
      ? { approach: 'dayByDay', payoutTaken: true, strategy: 'conservative' }
      : null
  } catch {
    return null
  }
}
