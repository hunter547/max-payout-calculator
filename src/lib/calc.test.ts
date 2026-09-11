import { describe, expect, it } from 'vitest'
import { buildPlan, calculate, planFor, type CalcInputs } from './calc'

/** The exact input row (A3:G3) saved in the .xlsx. */
const SHEET_INPUTS: CalcInputs = {
  balance: 4758.34,
  payoutBuffer: 2100,
  payoutCap: 2000,
  largestProfitDay: 359,
  currentNetProfit: 6.6,
  consistencyRequirement: 0.5,
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

  it('takes the payout-shortfall branch of E3 when it exceeds the 500 floor', () => {
    // (2100 + 2000) - 1000 = 3100, which beats the 500 floor.
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
      const inputs = { ...SHEET_INPUTS, consistencyRequirement }
      const r = calculate(inputs)
      expect(r.dailyTargetWithinConsistency).toBe(true)
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
    // Direct check of the rules the plan has to satisfy on final totals.
    const pays = (inputs: CalcInputs, n: number, x: number) => {
      const total = inputs.currentNetProfit + n * x
      const target = Math.max(
        500,
        inputs.payoutBuffer + inputs.payoutCap - inputs.balance,
      )
      const largest = Math.max(Math.abs(inputs.largestProfitDay), x)
      return (
        total >= target - 1e-6 &&
        largest <= inputs.consistencyRequirement * total + 1e-6
      )
    }

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
            if (results.targetMet) continue

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
