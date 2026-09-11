import type { CalcInputs, Strategy } from '@/lib/calc'
import { parseAmount, type DayEntry, type LedgerSummary } from '@/lib/ledger'

export type Approach = 'pointInTime' | 'dayByDay'

export interface Setup {
  approach: Approach
  /** Day-by-day only: once a payout is taken, balance is entered, not derived. */
  payoutTaken: boolean
  /** Missing on setups saved before strategies existed; read as conservative. */
  strategy?: Strategy
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
    // Before any payout, the balance above the start is everything logged.
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
