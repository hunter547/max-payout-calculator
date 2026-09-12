import { describe, expect, it } from 'vitest'
import {
  buildPlan,
  calculate,
  curatedPlan,
  fastestDays,
  MAX_PLAN_DAYS,
  planFor,
  type CalcInputs,
} from './calc'

/**
 * The workbook's own row, in template terms: its payout buffer 2100 plus cap
 * 2000 is the 4100 threshold, and its 500 literal is the minimum payout. The
 * three logged days that produced the largest day and net profit already clear
 * the 50k Builder's two-day minimum.
 */
const SHEET_INPUTS: CalcInputs = {
  balance: 4758.34,
  payoutThreshold: 4100,
  minimumPayout: 500,
  largestProfitDay: 359,
  currentNetProfit: 6.6,
  consistencyRequirement: 0.5,
  minTradingDays: 2,
  tradingDaysSoFar: 3,
}

describe('calculate — parity with the spreadsheet', () => {
  it('reproduces every cached formula result in the workbook', () => {
    const r = calculate(SHEET_INPUTS)

    expect(r.minimumTargetNetProfit).toBe(500) // E3
    expect(r.minimumNetProfitRequired).toBe(718) // H3
    expect(r.remainingProfitNeeded).toBeCloseTo(711.4, 9) // I3
    expect(r.minimumTradingDaysLeft).toBe(2) // J3
    expect(r.dailyProfitNeeded).toBeCloseTo(355.7, 9) // K3
  })

  it('takes the payout-shortfall branch of E3 when it exceeds the minimum payout', () => {
    // 4100 - 1000 = 3100, which beats the 500 floor.
    const r = calculate({ ...SHEET_INPUTS, balance: 1000 })
    expect(r.minimumTargetNetProfit).toBe(3100)
    expect(r.minimumNetProfitRequired).toBe(3100) // 359/0.5 = 718 loses the MAX
  })

  it('takes the consistency branch of H3 when the largest day dominates', () => {
    const r = calculate({ ...SHEET_INPUTS, largestProfitDay: 900 })
    expect(r.minimumNetProfitRequired).toBe(1800) // 900 / 0.5
  })

  it('uses ABS() on the largest profit day, matching D3', () => {
    const positive = calculate({ ...SHEET_INPUTS, largestProfitDay: 359 })
    const negative = calculate({ ...SHEET_INPUTS, largestProfitDay: -359 })
    expect(negative.minimumNetProfitRequired).toBe(
      positive.minimumNetProfitRequired,
    )
  })
})

describe('calculate — edge cases the sheet leaves as Excel errors', () => {
  it('reports zero days and zero daily target once the requirement is met', () => {
    const r = calculate({ ...SHEET_INPUTS, currentNetProfit: 1000 })
    expect(r.targetMet).toBe(true)
    expect(r.remainingProfitNeeded).toBeLessThanOrEqual(0)
    expect(r.minimumTradingDaysLeft).toBe(0)
    expect(r.dailyProfitNeeded).toBe(0)
    expect(r.payoutReady).toBe(true)
  })

  it('degrades to the E3 floor instead of #DIV/0! at 0% consistency', () => {
    const r = calculate({ ...SHEET_INPUTS, consistencyRequirement: 0 })
    expect(Number.isFinite(r.minimumNetProfitRequired)).toBe(true)
    expect(r.minimumNetProfitRequired).toBe(500)
    expect(r.minimumTradingDaysLeft).toBe(0)
  })

  it('never rounds a whole-number day count up through float dust', () => {
    // I3 / (H3*G3) lands on exactly 2 here; binary float must not make it 3.
    const r = calculate({
      ...SHEET_INPUTS,
      largestProfitDay: 0,
      currentNetProfit: 0,
      consistencyRequirement: 0.5,
    })
    expect(r.minimumNetProfitRequired).toBe(500)
    expect(r.minimumTradingDaysLeft).toBe(2)
    expect(r.dailyProfitNeeded).toBe(250)
  })
})

describe('consistency guardrail', () => {
  it('keeps the equal-split daily target inside the consistency ceiling', () => {
    const r = calculate(SHEET_INPUTS)
    expect(r.maxAllowedSingleDay).toBe(359) // 718 * 0.5
    expect(r.dailyTargetWithinConsistency).toBe(true)
    expect(r.largestDayWithinConsistency).toBe(true)
  })

  it('holds for a sweep of consistency requirements', () => {
    for (const consistencyRequirement of [0.1, 0.2, 0.25, 0.3, 0.5, 0.8, 1]) {
      const r = calculate({ ...SHEET_INPUTS, consistencyRequirement })
      expect(r.dailyTargetWithinConsistency).toBe(true)
    }
  })
})

describe('minimum trading days', () => {
  // Tradeify's Growth rules: five trading days before any payout.
  const growth: CalcInputs = {
    balance: 25400,
    payoutThreshold: 26500,
    minimumPayout: 0,
    largestProfitDay: 300,
    currentNetProfit: 400,
    consistencyRequirement: 0.35,
    minTradingDays: 5,
    tradingDaysSoFar: 1,
  }

  it('counts the days the firm still needs', () => {
    const r = calculate(growth)
    expect(r.eligibilityDaysLeft).toBe(4)
    expect(r.payoutReady).toBe(false)
    expect(calculate({ ...growth, tradingDaysSoFar: 9 }).eligibilityDaysLeft).toBe(0)
  })

  it('stretches every plan to the firm minimum', () => {
    const r = calculate(growth)
    expect(r.minimumTradingDaysLeft).toBeLessThan(4) // the profit needs fewer

    for (const strategy of ['conservative', 'aggressive'] as const) {
      const plan = planFor(growth, r, strategy)
      expect(plan.days).toBe(4)
      expect(plan.heldByEligibility).toBe(true)
      // Spread over more days, so each day asks for less.
      expect(plan.dailyProfit).toBeLessThanOrEqual(r.dailyProfitNeeded + 1e-9)
    }
    expect(fastestDays(growth, r)).toBe(4)
  })

  it('leaves days to trade when the profit is there but the days are not', () => {
    const met = { ...growth, currentNetProfit: 5000, tradingDaysSoFar: 2 }
    const r = calculate(met)
    expect(r.targetMet).toBe(true)
    expect(r.payoutReady).toBe(false)

    const plan = planFor(met, r, 'conservative')
    expect(plan.days).toBe(3)
    expect(plan.dailyProfit).toBe(0)
    expect(plan.heldByEligibility).toBe(true)
  })

  it('is done when both the profit and the days are covered', () => {
    const done = { ...growth, currentNetProfit: 5000, tradingDaysSoFar: 5 }
    const r = calculate(done)
    expect(r.payoutReady).toBe(true)
    expect(planFor(done, r, 'conservative').days).toBe(0)
  })
})

/** Direct check of the rules a plan has to satisfy on final totals. */
function pays(inputs: CalcInputs, n: number, x: number): boolean {
  const total = inputs.currentNetProfit + n * x
  const target = Math.max(inputs.minimumPayout, inputs.payoutThreshold - inputs.balance)
  const largest = Math.max(Math.abs(inputs.largestProfitDay), x)
  const enoughDays = n >= Math.max(0, inputs.minTradingDays - inputs.tradingDaysSoFar)
  return (
    enoughDays &&
    total >= target - 1e-6 &&
    largest <= inputs.consistencyRequirement * total + 1e-6
  )
}

describe('planFor', () => {
  it('conservative is exactly the spreadsheet plan', () => {
    const results = calculate(SHEET_INPUTS)
    expect(planFor(SHEET_INPUTS, results, 'conservative')).toEqual({
      strategy: 'conservative',
      days: 2,
      dailyProfit: results.dailyProfitNeeded,
      requiredProfit: 718,
      dailyCap: 359,
      raisesTarget: false,
      heldByEligibility: false,
    })
  })

  it('aggressive matches conservative when nothing needs to be caught up', () => {
    const results = calculate(SHEET_INPUTS)
    const plan = planFor(SHEET_INPUTS, results, 'aggressive')
    expect(plan.days).toBe(2)
    expect(plan.dailyProfit).toBeCloseTo(355.7, 9)
    expect(plan.raisesTarget).toBe(false)
  })

  it('aggressive: −$1,050 with a $500 largest day takes 3 days of $1,050', () => {
    const inputs = {
      ...SHEET_INPUTS,
      largestProfitDay: 500,
      currentNetProfit: -1050,
    }
    const results = calculate(inputs)

    // Conservative stays under the $500 cap: $2,050 over 5 days.
    const safe = planFor(inputs, results, 'conservative')
    expect(safe.days).toBe(5)
    expect(safe.dailyProfit).toBeCloseTo(410, 9)

    // Aggressive: 3 days of $1,050 lifts the target to $2,100.
    const fast = planFor(inputs, results, 'aggressive')
    expect(fast.days).toBe(3)
    expect(fast.dailyProfit).toBeCloseTo(1050, 9)
    expect(fast.requiredProfit).toBeCloseTo(2100, 9)
    expect(fast.dailyCap).toBeCloseTo(1050, 9)
    expect(fast.raisesTarget).toBe(true)
  })

  it('aggressive is never slower, always pays out, and is the fewest days', () => {
    for (const balance of [4758.34, 1000]) {
      for (const currentNetProfit of [-3000, -1050, -400, 0, 6.6, 250, 900]) {
        for (const largestProfitDay of [0, 359, 500, 1200]) {
          for (const consistencyRequirement of [0.2, 0.3, 0.5, 0.8]) {
            const inputs = {
              ...SHEET_INPUTS,
              balance,
              currentNetProfit,
              largestProfitDay,
              consistencyRequirement,
            }
            const results = calculate(inputs)
            if (results.payoutReady) continue

            const safe = planFor(inputs, results, 'conservative')
            const fast = planFor(inputs, results, 'aggressive')
            const at = JSON.stringify(inputs)

            expect(fast.days, at).toBeLessThanOrEqual(safe.days)
            expect(pays(inputs, fast.days, fast.dailyProfit), at).toBe(true)
            expect(fast.dailyProfit, at).toBeLessThanOrEqual(fast.dailyCap + 1e-6)
            expect(fast.requiredProfit, at).toBeCloseTo(
              currentNetProfit + fast.days * fast.dailyProfit,
              6,
            )

            // No daily amount gets there a day sooner. Collect, then assert
            // once: calling expect() per grid step makes this test crawl.
            if (fast.days > 1) {
              let sooner: number | null = null
              for (let x = 0; x <= 20000 && sooner === null; x += 0.5) {
                if (pays(inputs, fast.days - 1, x)) sooner = x
              }
              expect(sooner, at).toBeNull()
            }
          }
        }
      }
    }
  })
})

describe('curatedPlan', () => {
  // −$1,050 behind with a $500 largest day: the fastest plan is 3 days.
  const behind = {
    ...SHEET_INPUTS,
    largestProfitDay: 500,
    currentNetProfit: -1050,
  }
  const results = calculate(behind)

  it('takes a day count from the fastest plan upward', () => {
    expect(fastestDays(behind, results)).toBe(3)

    const four = curatedPlan(behind, results, { mode: 'days', days: 4 })!
    expect(four.days).toBe(4)
    expect(four.dailyProfit).toBeCloseTo(525, 9)
    expect(four.requiredProfit).toBeCloseTo(1050, 9)
    expect(four.raisesTarget).toBe(true)

    const nine = curatedPlan(behind, results, { mode: 'days', days: 9 })!
    expect(nine.dailyProfit).toBeCloseTo(2050 / 9, 9)
    expect(nine.raisesTarget).toBe(false)
  })

  it('raises a day count below the fastest plan to that minimum', () => {
    const plan = curatedPlan(behind, results, { mode: 'days', days: 2 })!
    expect(plan.days).toBe(3)
    expect(plan.dailyProfit).toBeCloseTo(1050, 9)
    expect(plan.adjusted).toBe(true)
  })

  it('works out the number of days from a custom daily cap', () => {
    const plan = curatedPlan(behind, results, { mode: 'cap', cap: 700 })!
    expect(plan.days).toBe(4)
    expect(plan.dailyProfit).toBeCloseTo(525, 9)
    expect(plan.dailyCap).toBe(700)
    expect(plan.customCap).toBe(true)
  })

  it('gives up on a cap that would take more than a year of sessions', () => {
    expect(MAX_PLAN_DAYS).toBe(252)
    expect(curatedPlan(behind, results, { mode: 'cap', cap: 1 })).toBeNull()
  })

  it('never goes below the firm minimum trading days', () => {
    const strict = { ...behind, minTradingDays: 6, tradingDaysSoFar: 0 }
    const r = calculate(strict)
    expect(curatedPlan(strict, r, { mode: 'days', days: 3 })!.days).toBe(6)
    expect(curatedPlan(strict, r, { mode: 'cap', cap: 5000 })!.days).toBe(6)
  })

  it('matches conservative at its cap, and any day count pays out', () => {
    for (const balance of [4758.34, 1000]) {
      for (const currentNetProfit of [-3000, -1050, -400, 0, 6.6, 250, 900]) {
        for (const largestProfitDay of [0, 359, 500, 1200]) {
          for (const consistencyRequirement of [0.2, 0.3, 0.5, 0.8]) {
            const inputs = {
              ...SHEET_INPUTS,
              balance,
              currentNetProfit,
              largestProfitDay,
              consistencyRequirement,
            }
            const r = calculate(inputs)
            if (r.payoutReady) continue
            const at = JSON.stringify(inputs)

            // The conservative cap reproduces the conservative plan.
            const safe = planFor(inputs, r, 'conservative')
            const atCap = curatedPlan(inputs, r, {
              mode: 'cap',
              cap: r.maxAllowedSingleDay,
            })
            expect(atCap?.days, at).toBe(safe.days)
            expect(atCap!.dailyProfit, at).toBeCloseTo(safe.dailyProfit, 6)

            // Every day count from the fastest up pays out, and more days
            // never ask for more per day.
            const fastest = fastestDays(inputs, r)
            let previous = Infinity
            for (let n = fastest; n <= fastest + 6; n++) {
              const plan = curatedPlan(inputs, r, { mode: 'days', days: n })
              expect(plan, at).not.toBeNull()
              expect(plan!.days, at).toBe(n)
              expect(pays(inputs, n, plan!.dailyProfit), at).toBe(true)
              expect(plan!.dailyProfit, at).toBeLessThanOrEqual(previous + 1e-9)
              previous = plan!.dailyProfit
            }
          }
        }
      }
    }
  })
})

describe('buildPlan', () => {
  it('walks current net profit up to the requirement', () => {
    const results = calculate(SHEET_INPUTS)
    const plan = buildPlan(
      SHEET_INPUTS,
      planFor(SHEET_INPUTS, results, 'conservative'),
    )

    expect(plan).toHaveLength(2)
    expect(plan[0].profitNeeded).toBeCloseTo(355.7, 9)
    expect(plan[plan.length - 1].cumulativeNetProfit).toBeCloseTo(
      results.minimumNetProfitRequired,
      9,
    )
  })

  it('is empty when no further trading days are required', () => {
    const inputs = { ...SHEET_INPUTS, currentNetProfit: 5000 }
    const results = calculate(inputs)
    expect(buildPlan(inputs, planFor(inputs, results, 'aggressive'))).toHaveLength(0)
  })
})
