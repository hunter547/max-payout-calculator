/**
 * Port of "MyFundedFutrures 50k Builder Max Payout Calculator.xlsx" (Sheet1).
 *
 * Spreadsheet cells -> fields:
 *   A3 Balance                            -> balance
 *   B3 Payout Buffer                      -> payoutBuffer
 *   C3 Payout Cap                         -> payoutCap
 *   D3 Largest Profit Day                 -> largestProfitDay
 *   E3 Minimum Target Net Profit          =MAX(500, (B3+C3)-A3)
 *   F3 Current Net Profit                 -> currentNetProfit
 *   G3 Consistency Requirement            -> consistencyRequirement (fraction, 0.5 = 50%)
 *   H3 Minimum Net Profit Required        =MAX(E3, ABS(D3)/G3)
 *   I3 Remaining Profit Needed            =H3-F3
 *   J3 Minimum Number of Trading Days Left=CEILING.MATH(I3/(H3*G3))
 *   K3 Daily Profit Needed (equal split)  =I3/J3
 */

/** The `500` literal inside E3's MAX(). The 50k Builder minimum payout. */
export const MINIMUM_PAYOUT_FLOOR = 500

export interface CalcInputs {
  balance: number
  payoutBuffer: number
  payoutCap: number
  largestProfitDay: number
  currentNetProfit: number
  /** Fraction, not percent: 0.5 means 50%. */
  consistencyRequirement: number
}

export interface CalcResults {
  /** E3 */
  minimumTargetNetProfit: number
  /** H3 */
  minimumNetProfitRequired: number
  /** I3 */
  remainingProfitNeeded: number
  /** J3 */
  minimumTradingDaysLeft: number
  /** K3 */
  dailyProfitNeeded: number
  /** H3 * G3 — the largest any single day may be without breaking consistency. */
  maxAllowedSingleDay: number
  /** True once current net profit already covers the requirement (I3 <= 0). */
  targetMet: boolean
  /** Does the existing largest profit day already satisfy the consistency rule? */
  largestDayWithinConsistency: boolean
  /** Would the equal-split daily target itself satisfy the consistency rule? */
  dailyTargetWithinConsistency: boolean
}

/**
 * Excel evaluates at 15 significant digits, which hides the binary-float dust
 * that would otherwise push a value like 2.0000000000000004 up to 3 in
 * CEILING.MATH. Round the ratio before ceiling so we match the sheet.
 */
function ceilingMath(value: number): number {
  const settled = Number(value.toPrecision(12))
  return Math.ceil(settled)
}

export function calculate(inputs: CalcInputs): CalcResults {
  const {
    balance,
    payoutBuffer,
    payoutCap,
    largestProfitDay,
    currentNetProfit,
    consistencyRequirement: consistency,
  } = inputs

  // E3 =MAX(500, (B3+C3)-A3)
  const minimumTargetNetProfit = Math.max(
    MINIMUM_PAYOUT_FLOOR,
    payoutBuffer + payoutCap - balance,
  )

  // H3 =MAX(E3, ABS(D3)/G3).  Excel yields #DIV/0! at G3=0; we fall back to the
  // E3 floor so the UI can keep rendering while flagging the input as invalid.
  const consistencyDriven =
    consistency > 0 ? Math.abs(largestProfitDay) / consistency : 0
  const minimumNetProfitRequired = Math.max(
    minimumTargetNetProfit,
    consistencyDriven,
  )

  // I3 =H3-F3
  const remainingProfitNeeded = minimumNetProfitRequired - currentNetProfit

  const maxAllowedSingleDay = minimumNetProfitRequired * consistency
  const targetMet = remainingProfitNeeded <= 0

  // J3 =CEILING.MATH(I3/(H3*G3)).  The sheet returns 0 (then K3 -> #DIV/0!) once
  // the target is already met; we short-circuit both to 0 instead.
  const minimumTradingDaysLeft =
    targetMet || maxAllowedSingleDay <= 0
      ? 0
      : ceilingMath(remainingProfitNeeded / maxAllowedSingleDay)

  // K3 =I3/J3
  const dailyProfitNeeded =
    minimumTradingDaysLeft > 0
      ? remainingProfitNeeded / minimumTradingDaysLeft
      : 0

  return {
    minimumTargetNetProfit,
    minimumNetProfitRequired,
    remainingProfitNeeded,
    minimumTradingDaysLeft,
    dailyProfitNeeded,
    maxAllowedSingleDay,
    targetMet,
    largestDayWithinConsistency:
      Math.abs(largestProfitDay) <= maxAllowedSingleDay + 1e-9,
    dailyTargetWithinConsistency:
      dailyProfitNeeded <= maxAllowedSingleDay + 1e-9,
  }
}

/**
 * Conservative: the spreadsheet's plan. Every planned day stays at or under
 * today's daily cap (H3 × G3, i.e. the default cap or the largest profit day,
 * whichever is higher), so the target never moves.
 *
 * Aggressive: the fewest days to payout, however big each day has to be.
 * Days above the current largest day raise the target, and the plan counts
 * that.
 *
 * Curated: the trader picks the number of days, or a daily cap that replaces
 * the default and largest-day cap and sets the number of days.
 */
export type Strategy = 'conservative' | 'aggressive' | 'curated'

export type CuratedChoice =
  | { mode: 'days'; days: number }
  | { mode: 'cap'; cap: number }

/** How far a curated cap may stretch a plan: a year of trading sessions. */
export const MAX_PLAN_DAYS = 252

export interface Plan {
  strategy: Strategy
  /** Trading days the plan takes; 0 once the target is met. */
  days: number
  /** Profit each planned day needs to make. */
  dailyProfit: number
  /** Net profit required once the planned days are counted. */
  requiredProfit: number
  /** Most one day can make under the plan once it's done. */
  dailyCap: number
  /** Planned days top the current largest day and lift the target. */
  raisesTarget: boolean
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
 * Together those give x >= I3 / n, plus x·(1 − G·n) <= G·F. Once some n is
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
  let lo = results.remainingProfitNeeded / n
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
 * Fewest equal days that reach payout. Equal days are optimal: for a given
 * total they keep the largest day as small as possible. The conservative plan
 * always satisfies the same rules, so this never needs more than J3 days.
 */
function fewestDays(
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

/** The fewest trading days any plan can reach payout in: the aggressive count. */
export function fastestDays(inputs: CalcInputs, results: CalcResults): number {
  return fewestDays(inputs, results).days
}

/** A plan of `days` equal days, with the target those days imply. */
function planOf(
  inputs: CalcInputs,
  results: CalcResults,
  strategy: Strategy,
  days: number,
  dailyProfit: number,
): Plan {
  const G = inputs.consistencyRequirement
  const largest = Math.max(Math.abs(inputs.largestProfitDay), dailyProfit)
  const requiredProfit = Math.max(results.minimumTargetNetProfit, largest / G)
  return {
    strategy,
    days,
    dailyProfit,
    requiredProfit,
    dailyCap: requiredProfit * G,
    raisesTarget: requiredProfit > results.minimumNetProfitRequired + 1e-9,
  }
}

export function planFor(
  inputs: CalcInputs,
  results: CalcResults,
  strategy: 'conservative' | 'aggressive',
): Plan {
  const conservative: Plan = {
    strategy,
    days: results.minimumTradingDaysLeft,
    dailyProfit: results.dailyProfitNeeded,
    requiredProfit: results.minimumNetProfitRequired,
    dailyCap: results.maxAllowedSingleDay,
    raisesTarget: false,
  }
  if (strategy === 'conservative' || conservative.days === 0) {
    return conservative
  }

  const { days, dailyProfit } = fewestDays(inputs, results)
  return planOf(inputs, results, strategy, days, dailyProfit)
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
  if (results.minimumTradingDaysLeft === 0) {
    return { ...planFor(inputs, results, 'conservative'), strategy: 'curated' }
  }

  const fastest = fastestDays(inputs, results)

  if (choice.mode === 'days') {
    const days = Math.max(Math.round(choice.days), fastest)
    const dailyProfit = dailyFor(inputs, results, days)
    if (dailyProfit === null) return null
    return {
      ...planOf(inputs, results, 'curated', days, dailyProfit),
      adjusted: days !== choice.days,
    }
  }

  if (!(choice.cap > 0)) return null
  // Each day is at least I3 / n, so no plan under the cap is shorter than this.
  const start = Math.max(
    fastest,
    Math.ceil(results.remainingProfitNeeded / choice.cap - 1e-9),
  )
  for (let n = start; n <= MAX_PLAN_DAYS; n++) {
    const dailyProfit = dailyFor(inputs, results, n)
    if (dailyProfit !== null && dailyProfit <= choice.cap * (1 + 1e-9)) {
      return {
        ...planOf(inputs, results, 'curated', n, dailyProfit),
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
