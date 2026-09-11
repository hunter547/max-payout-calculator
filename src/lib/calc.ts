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

export interface PlanDay {
  day: number
  profitNeeded: number
  cumulativeNetProfit: number
}

/** The equal-split schedule implied by J3 and K3. */
export function buildPlan(
  inputs: CalcInputs,
  results: CalcResults,
): PlanDay[] {
  const days: PlanDay[] = []
  let running = inputs.currentNetProfit
  for (let day = 1; day <= results.minimumTradingDaysLeft; day++) {
    running += results.dailyProfitNeeded
    days.push({
      day,
      profitNeeded: results.dailyProfitNeeded,
      cumulativeNetProfit: running,
    })
  }
  return days
}
