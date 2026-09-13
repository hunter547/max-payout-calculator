/**
 * The payout maths. Five figures, worked out in order:
 *
 *   minimum target net profit   = MAX(minimum payout, profit goal,
 *                                     net profit + (threshold - balance))
 *   minimum net profit required = MAX(that target, ABS(largest day) / consistency)
 *   remaining profit needed     = required - net profit
 *   minimum trading days left   = ceil(remaining / (required * consistency))
 *   daily profit needed         = remaining / days
 *
 * The threshold is the balance a max payout needs, which for the 50k Builder
 * the calculation grew up on is its payout buffer plus its payout cap
 * (2100 + 2000 = 4100); the minimum payout is that firm's 500.
 *
 * A firm can also require a number of trading days since the last payout
 * before it will pay at all, and set the profit a day has to beat before it
 * counts as one of them.
 */

/**
 * A day has to make *more* than the firm's bar to count, so a plan aims one
 * cent over it. Money is tracked to cents everywhere else, so this is the
 * smallest step that is still a real number to trade to.
 */
export const QUALIFYING_STEP = 0.01

export interface CalcInputs {
  /** Balance in the account's own terms; see the template's startingBalance. */
  balance: number
  /** Balance needed before the biggest payout can be requested. */
  payoutThreshold: number
  /** Profit a payout needs regardless of the threshold; 0 when there is none. */
  minimumPayout: number
  /**
   * Profit to earn since the last payout before one can be requested; 0 where
   * the firm gates on balance instead. It resets with each payout, which is
   * what net profit already counts from.
   */
  profitGoal: number
  largestProfitDay: number
  currentNetProfit: number
  /** Fraction, not percent: 0.5 means 50%. */
  consistencyRequirement: number
  /** Trading days the firm needs since the last payout. */
  minTradingDays: number
  /** Trading days already behind you in this payout cycle. */
  tradingDaysSoFar: number
  /**
   * Profit a day must beat to count towards `minTradingDays`; 0 where the firm
   * counts every trading day. A planned day has to clear it too, or it buys
   * profit without buying eligibility.
   */
  qualifyingDayProfit: number
  /** Whether a day landing exactly on that bar counts towards the minimum. */
  qualifyingDayInclusive?: boolean
  /**
   * Days over the bar the firm needs, where that is fewer than the days it
   * needs in total, and how many of those are already behind you. Apex's
   * legacy accounts want eight days, five of them over $50.
   */
  minQualifyingDays?: number
  qualifyingDaysSoFar?: number
}

export interface CalcResults {
  /** What the firm's own rules ask for, before consistency has its say. */
  minimumTargetNetProfit: number
  /** That target, raised where the consistency rule asks for more. */
  minimumNetProfitRequired: number
  /** The requirement less the profit already made. */
  remainingProfitNeeded: number
  /** The days the profit alone needs, before any firm minimum. */
  minimumTradingDaysLeft: number
  /** The remaining profit split equally over those days. */
  dailyProfitNeeded: number
  /** Requirement x consistency: the most any single day may be. */
  maxAllowedSingleDay: number
  /** True once net profit covers the requirement. */
  targetMet: boolean
  /** Trading days still needed purely to qualify for a payout. */
  eligibilityDaysLeft: number
  /** What a planned day must make to count, once eligibility is what binds. */
  qualifyingDailyProfit: number
  /** Both the profit and the trading days are covered. */
  payoutReady: boolean
  /** Does the existing largest profit day satisfy the consistency rule? */
  largestDayWithinConsistency: boolean
  /** Would the equal-split daily target itself satisfy the consistency rule? */
  dailyTargetWithinConsistency: boolean
}

/**
 * Rounding up is only safe on an exact ratio: binary-float dust turns a true 2
 * into 2.0000000000000004, and the ceiling of that is 3 — a trading day the
 * trader does not actually owe. Settle the ratio first, then round it up.
 */
function ceilingMath(value: number): number {
  const settled = Number(value.toPrecision(12))
  return Math.ceil(settled)
}

export function calculate(inputs: CalcInputs): CalcResults {
  const {
    balance,
    payoutThreshold,
    minimumPayout,
    profitGoal,
    largestProfitDay,
    currentNetProfit,
    consistencyRequirement: consistency,
    minTradingDays,
    tradingDaysSoFar,
    qualifyingDayProfit,
    qualifyingDayInclusive = false,
    minQualifyingDays,
    qualifyingDaysSoFar,
  } = inputs

  // The minimum payout, or the balance shortfall, or a profit goal where the
  // firm sets one: whichever asks for most.
  //
  // The balance term is a shortfall, but this is a total, and the remaining
  // profit below takes the profit already made off it. The balance already
  // counts that profit, so the shortfall has to be added onto it, or it comes
  // off twice — a mistake that hides on accounts whose balance starts above
  // the threshold and shows plainly on one starting at zero.
  const minimumTargetNetProfit = Math.max(
    minimumPayout,
    profitGoal,
    currentNetProfit + (payoutThreshold - balance),
  )

  // Raised where the consistency rule asks for more than the firm's own
  // figures do. A rule of zero divides by zero, so it falls back to the target
  // and the UI flags the input rather than rendering nothing.
  const consistencyDriven =
    consistency > 0 ? Math.abs(largestProfitDay) / consistency : 0
  const minimumNetProfitRequired = Math.max(
    minimumTargetNetProfit,
    consistencyDriven,
  )

  const remainingProfitNeeded = minimumNetProfitRequired - currentNetProfit

  const maxAllowedSingleDay = minimumNetProfitRequired * consistency
  const targetMet = remainingProfitNeeded <= 0

  // Days are the remaining profit over the daily cap, rounded up. With the
  // target already met there is nothing to divide, so both figures are zero.
  const minimumTradingDaysLeft =
    targetMet || maxAllowedSingleDay <= 0
      ? 0
      : ceilingMath(remainingProfitNeeded / maxAllowedSingleDay)

  const dailyProfitNeeded =
    minimumTradingDaysLeft > 0
      ? remainingProfitNeeded / minimumTradingDaysLeft
      : 0

  // Two counts where a firm keeps two: the days it wants in all, and the days
  // over the bar among them. Whichever is further away sets the days left.
  const eligibilityDaysLeft = Math.max(
    0,
    Math.ceil(minTradingDays - tradingDaysSoFar),
    minQualifyingDays !== undefined
      ? Math.ceil(minQualifyingDays - (qualifyingDaysSoFar ?? tradingDaysSoFar))
      : 0,
  )

  return {
    minimumTargetNetProfit,
    minimumNetProfitRequired,
    remainingProfitNeeded,
    minimumTradingDaysLeft,
    dailyProfitNeeded,
    maxAllowedSingleDay,
    targetMet,
    eligibilityDaysLeft,
    // Only binds while days are still owed: once they are, a planned day is
    // just profit and can be any size.
    qualifyingDailyProfit:
      eligibilityDaysLeft > 0 && qualifyingDayProfit > 0
        ? qualifyingDayProfit + (qualifyingDayInclusive ? 0 : QUALIFYING_STEP)
        : 0,
    payoutReady: targetMet && eligibilityDaysLeft === 0,
    largestDayWithinConsistency:
      Math.abs(largestProfitDay) <= maxAllowedSingleDay + 1e-9,
    dailyTargetWithinConsistency:
      dailyProfitNeeded <= maxAllowedSingleDay + 1e-9,
  }
}

/**
 * Conservative: the spreadsheet's plan. Every planned day stays at or under
 * today's daily cap (requirement x consistency, i.e. the default cap or the
 * largest profit day,
 * whichever is higher), so the target never moves.
 *
 * Aggressive: the fewest days to payout, however big each day has to be.
 * Days above the current largest day raise the target, and the plan counts
 * that.
 *
 * Curated: the trader picks the number of days, or a daily cap that replaces
 * the default and largest-day cap and sets the number of days.
 *
 * Every plan also covers the firm's remaining trading days, so it never
 * promises a payout the account is not yet eligible for.
 */
export type Strategy = 'conservative' | 'aggressive' | 'curated'

export type CuratedChoice =
  | { mode: 'days'; days: number }
  | { mode: 'cap'; cap: number }

/** How far a curated cap may stretch a plan: a year of trading sessions. */
export const MAX_PLAN_DAYS = 252

export interface Plan {
  strategy: Strategy
  /** Trading days the plan takes; 0 once the payout is ready. */
  days: number
  /** Profit each planned day needs; 0 when only trading days are missing. */
  dailyProfit: number
  /** Net profit required once the planned days are counted. */
  requiredProfit: number
  /** Most one day can make under the plan once it is done. */
  dailyCap: number
  /** Planned days top the current largest day and lift the target. */
  raisesTarget: boolean
  /** The plan runs longer than the profit needs, to reach the firm minimum. */
  heldByEligibility: boolean
  /** Curated by cap: dailyCap is the trader's own cap. */
  customCap?: boolean
  /** Curated by days: the pick was below the fewest possible and was raised. */
  adjusted?: boolean
}

/**
 * The smallest daily amount that reaches payout in exactly n equal days, or
 * null if no amount can. With F = net profit, D = largest day, E = minimum
 * target, G = consistency, n days of x must satisfy, on the final total
 * T = F + n·x:
 *   T >= E                  (minimum target)
 *   max(D, x) <= G·T        (consistency, counting the new days)
 * Together those give x >= (remaining profit) / n, plus x·(1 − G·n) <= G·F.
 * Once some n is
 * possible, every larger n is too.
 */
function dailyFor(
  inputs: CalcInputs,
  results: CalcResults,
  n: number,
): number | null {
  const F = inputs.currentNetProfit
  const G = inputs.consistencyRequirement
  const gn = G * n
  // Days owed to the firm have to count, and equal days mean all of them do.
  let lo = Math.max(
    results.remainingProfitNeeded / n,
    results.qualifyingDailyProfit,
  )
  let hi = Infinity

  if (Math.abs(gn - 1) < 1e-9) {
    // x·0 <= G·F: only possible without a drawdown to climb out of.
    if (F < 0) return null
  } else if (gn < 1) {
    // x <= G·F / (1 − G·n): needs profit already banked.
    if (F <= 0) return null
    hi = (G * F) / (1 - gn)
  } else if (F < 0) {
    // x >= G·|F| / (G·n − 1): each day must also cover the drawdown.
    lo = Math.max(lo, (G * -F) / (gn - 1))
  }

  return lo <= hi * (1 + 1e-9) ? lo : null
}

/**
 * Fewest equal days that reach the profit target. Equal days are optimal: for
 * a given total they keep the largest day as small as possible. The
 * conservative plan always satisfies the same rules, so this never needs more
 * days than that one does.
 */
function fewestProfitDays(
  inputs: CalcInputs,
  results: CalcResults,
): { days: number; dailyProfit: number } {
  for (let n = 1; n <= results.minimumTradingDaysLeft; n++) {
    const dailyProfit = dailyFor(inputs, results, n)
    if (dailyProfit !== null) return { days: n, dailyProfit }
  }
  return {
    days: results.minimumTradingDaysLeft,
    dailyProfit: results.dailyProfitNeeded,
  }
}

/** The fewest trading days any plan can take: the aggressive count. */
export function fastestDays(inputs: CalcInputs, results: CalcResults): number {
  return Math.max(
    fewestProfitDays(inputs, results).days,
    results.eligibilityDaysLeft,
  )
}

/** A plan of `days` equal days, with the target those days imply. */
function planOf(
  inputs: CalcInputs,
  results: CalcResults,
  strategy: Strategy,
  days: number,
): Plan {
  const G = inputs.consistencyRequirement
  // With the profit target met, the days left are the firm's, not the maths' —
  // but they still have to clear the bar the firm counts them by.
  const dailyProfit = results.targetMet
    ? results.qualifyingDailyProfit
    : Math.max(
        dailyFor(inputs, results, days) ?? results.dailyProfitNeeded,
        results.qualifyingDailyProfit,
      )
  const largest = Math.max(Math.abs(inputs.largestProfitDay), dailyProfit)
  const requiredProfit =
    G > 0
      ? Math.max(results.minimumTargetNetProfit, largest / G)
      : results.minimumNetProfitRequired

  return {
    strategy,
    days,
    dailyProfit,
    requiredProfit,
    dailyCap: requiredProfit * G,
    raisesTarget: requiredProfit > results.minimumNetProfitRequired + 1e-9,
    heldByEligibility: days > results.minimumTradingDaysLeft,
  }
}

function idlePlan(results: CalcResults, strategy: Strategy): Plan {
  return {
    strategy,
    days: 0,
    dailyProfit: 0,
    requiredProfit: results.minimumNetProfitRequired,
    dailyCap: results.maxAllowedSingleDay,
    raisesTarget: false,
    heldByEligibility: false,
  }
}

export function planFor(
  inputs: CalcInputs,
  results: CalcResults,
  strategy: 'conservative' | 'aggressive',
): Plan {
  const profitDays =
    strategy === 'conservative'
      ? results.minimumTradingDaysLeft
      : fewestProfitDays(inputs, results).days
  const days = Math.max(profitDays, results.eligibilityDaysLeft)
  return days === 0
    ? idlePlan(results, strategy)
    : planOf(inputs, results, strategy, days)
}

/**
 * Curated by days: that many equal days (never fewer than the fastest plan)
 * at the smallest amount that still pays out.
 *
 * Curated by cap: the fewest days whose equal daily amount stays at or under
 * the trader's cap. At the conservative cap this is the conservative plan.
 * Null if the cap would take more than MAX_PLAN_DAYS.
 */
export function curatedPlan(
  inputs: CalcInputs,
  results: CalcResults,
  choice: CuratedChoice,
): Plan | null {
  const fastest = fastestDays(inputs, results)
  if (fastest === 0) return idlePlan(results, 'curated')

  if (results.targetMet || choice.mode === 'days') {
    // Nothing left to earn, or a day count was named: honour the floor.
    const wanted = choice.mode === 'days' ? Math.round(choice.days) : fastest
    const days = Math.max(wanted, fastest)
    return {
      ...planOf(inputs, results, 'curated', days),
      adjusted: choice.mode === 'days' && days !== choice.days,
    }
  }

  if (!(choice.cap > 0)) return null
  // Each day is at least the remaining profit over n, so no plan under the cap
  // is shorter than this.
  const start = Math.max(
    fastest,
    Math.ceil(results.remainingProfitNeeded / choice.cap - 1e-9),
  )
  for (let n = start; n <= MAX_PLAN_DAYS; n++) {
    const dailyProfit = dailyFor(inputs, results, n)
    if (dailyProfit !== null && dailyProfit <= choice.cap * (1 + 1e-9)) {
      return {
        ...planOf(inputs, results, 'curated', n),
        dailyCap: choice.cap,
        customCap: true,
      }
    }
  }
  return null
}

export interface PlanDay {
  day: number
  profitNeeded: number
  cumulativeNetProfit: number
}

/** The day-by-day schedule for a plan: `days` equal days of `dailyProfit`. */
export function buildPlan(
  inputs: CalcInputs,
  plan: Pick<Plan, 'days' | 'dailyProfit'>,
): PlanDay[] {
  const days: PlanDay[] = []
  let running = inputs.currentNetProfit
  for (let day = 1; day <= plan.days; day++) {
    running += plan.dailyProfit
    days.push({
      day,
      profitNeeded: plan.dailyProfit,
      cumulativeNetProfit: running,
    })
  }
  return days
}
