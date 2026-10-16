import { describe, expect, it } from 'vitest'
import { ticksNeeded, type ContractSpec, type TradeCosts } from './ticks'

/**
 * A contract shaped like a quarter-point index future. The maths does not
 * care which contract it is; the registry's own figures are pinned against
 * their sources in contracts.test.ts.
 */
const QUARTER: ContractSpec = { tickSize: 0.25, tickValue: 12.5 }

const ONE: TradeCosts = { quantity: 1, roundTripFee: 4, slippageTicks: 1 }

/** What `ticks` nets, written from the trade rather than from the formula. */
function netOf(ticks: number, contract: ContractSpec, costs: TradeCosts) {
  const perContract =
    (ticks - costs.slippageTicks) * contract.tickValue - costs.roundTripFee
  return costs.quantity * perContract
}

describe('ticksNeeded', () => {
  it('rounds a target up so the trade reaches it', () => {
    // 100 / 12.5 = 8 ticks, the $4 fee is 0.32 of one, slippage is one more:
    // 9.32, so 10.
    const result = ticksNeeded(100, QUARTER, ONE, 'reach')
    expect(result).toEqual({
      ticks: 10,
      points: 2.5,
      gross: 125,
      fees: 4,
      slippage: 12.5,
      net: 108.5,
    })
  })

  it('rounds a cap down so the trade stays under it', () => {
    // Same 9.32: nine ticks nets $96, ten would net $108.50 and break a $100 cap.
    const result = ticksNeeded(100, QUARTER, ONE, 'stayUnder')
    expect(result?.ticks).toBe(9)
    expect(result?.net).toBe(96)
  })

  it('charges each contract its own fee and its own slippage', () => {
    const costs = { quantity: 3, roundTripFee: 4, slippageTicks: 1 }
    // 300 / 37.5 = 8, plus 0.32 and 1 again: still 10 ticks, but three times
    // the fees and slippage.
    const result = ticksNeeded(300, QUARTER, costs, 'reach')
    expect(result).toMatchObject({
      ticks: 10,
      gross: 375,
      fees: 12,
      slippage: 37.5,
      net: 325.5,
    })
  })

  it('counts slippage as the total ticks lost, so two is a tick each side', () => {
    const oneEachSide = { quantity: 1, roundTripFee: 4, slippageTicks: 2 }
    expect(ticksNeeded(100, QUARTER, oneEachSide, 'reach')?.ticks).toBe(11)
    const none = { quantity: 1, roundTripFee: 4, slippageTicks: 0 }
    expect(ticksNeeded(100, QUARTER, none, 'reach')?.ticks).toBe(9)
  })

  it('does not lose a tick to floating-point dust', () => {
    // 212.49 / 12.5 + 0.01 / 12.5 + 1 is exactly 18, but arrives as
    // 18.000000000000004 and would round up to 19.
    const penny = { quantity: 1, roundTripFee: 0.01, slippageTicks: 1 }
    expect(ticksNeeded(212.49, QUARTER, penny, 'reach')?.ticks).toBe(18)
    // And 74.99 is exactly 7, arriving as 6.999999999999999: rounding that
    // down would leave a whole tick of the cap unused.
    const capped = ticksNeeded(74.99, QUARTER, penny, 'stayUnder')
    expect(capped?.ticks).toBe(7)
    expect(capped?.net).toBeCloseTo(74.99, 9)
  })

  it('keeps points on the tick grid', () => {
    // 3 × 0.1 is 0.30000000000000004 in binary floating point.
    const tenth: ContractSpec = { tickSize: 0.1, tickValue: 1 }
    const free = { quantity: 1, roundTripFee: 0, slippageTicks: 0 }
    expect(ticksNeeded(3, tenth, free, 'reach')?.points).toBe(0.3)
  })

  it('turns away a cap the costs alone eat', () => {
    // A $5 cap, under one $12.50 tick, on a contract paying $4 and a tick of
    // slippage: the most ticks under it is 1, which nets −$4.
    expect(ticksNeeded(5, QUARTER, ONE, 'stayUnder')).toBeNull()
  })

  it('turns away amounts and quantities that are not a trade', () => {
    expect(ticksNeeded(0, QUARTER, ONE, 'reach')).toBeNull()
    expect(ticksNeeded(-50, QUARTER, ONE, 'reach')).toBeNull()
    expect(ticksNeeded(NaN, QUARTER, ONE, 'reach')).toBeNull()
    expect(ticksNeeded(100, QUARTER, { ...ONE, quantity: 0 }, 'reach')).toBeNull()
    expect(ticksNeeded(100, QUARTER, { ...ONE, quantity: 1.5 }, 'reach')).toBeNull()
    expect(
      ticksNeeded(100, QUARTER, { ...ONE, slippageTicks: -1 }, 'reach'),
    ).toBeNull()
  })

  it('lands on the fewest ticks that reach, and the most that stay under', () => {
    const specs: ContractSpec[] = [
      QUARTER,
      { tickSize: 0.25, tickValue: 1.25 },
      { tickSize: 0.01, tickValue: 10 },
      { tickSize: 0.1, tickValue: 10 },
      { tickSize: 0.00005, tickValue: 6.25 },
      { tickSize: 1, tickValue: 5 },
    ]
    for (const contract of specs) {
      for (const quantity of [1, 2, 5, 13]) {
        for (const roundTripFee of [0, 0.5, 1.04, 3.98, 4.5]) {
          for (const slippageTicks of [0, 1, 2]) {
            const costs = { quantity, roundTripFee, slippageTicks }
            for (const amount of [1, 47.3, 250, 718.25, 1999.99, 3243.56]) {
              const up = ticksNeeded(amount, contract, costs, 'reach')!
              expect(netOf(up.ticks, contract, costs)).toBeGreaterThanOrEqual(
                amount - 1e-9,
              )
              expect(netOf(up.ticks - 1, contract, costs)).toBeLessThan(amount)

              const down = ticksNeeded(amount, contract, costs, 'stayUnder')
              if (down === null) {
                // Only ever because nothing under the cap makes money.
                const best = Math.floor(
                  amount / (quantity * contract.tickValue) +
                    roundTripFee / contract.tickValue +
                    slippageTicks +
                    1e-9,
                )
                expect(netOf(best, contract, costs)).toBeLessThanOrEqual(1e-9)
                continue
              }
              expect(netOf(down.ticks, contract, costs)).toBeLessThanOrEqual(
                amount + 1e-9,
              )
              expect(netOf(down.ticks + 1, contract, costs)).toBeGreaterThan(
                amount,
              )
            }
          }
        }
      }
    }
  })
})
