/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { summarize } from './ledger'
import { deriveInputs, legacySetup, stepsFor } from './setup'

const RULES = { payoutBuffer: '2100', payoutCap: '2000', consistency: '50' }

describe('stepsFor', () => {
  it('asks point-in-time users for three numbers, then a strategy', () => {
    expect(stepsFor({ approach: 'pointInTime', payoutTaken: null })).toEqual([
      'approach',
      'balance',
      'largest',
      'cumulative',
      'strategy',
    ])
  })

  it('asks day-by-day users for a balance only after a payout', () => {
    expect(stepsFor({ approach: 'dayByDay', payoutTaken: true })).toEqual([
      'approach',
      'payout',
      'balance',
      'days',
      'strategy',
    ])
    expect(stepsFor({ approach: 'dayByDay', payoutTaken: false })).toEqual([
      'approach',
      'payout',
      'days',
      'strategy',
    ])
  })
})

describe('deriveInputs', () => {
  const days = [
    { id: 'a', date: '2026-09-08', amount: '359' },
    { id: 'b', date: '2026-09-09', amount: '-212.40' },
    { id: 'c', date: '2026-09-10', amount: '-140' },
  ]

  it('uses point-in-time numbers as typed', () => {
    const inputs = deriveInputs(
      {
        approach: 'pointInTime',
        payoutTaken: false,
        balance: '4758.34',
        largestProfitDay: '359',
        netProfit: '6.6',
      },
      summarize([]),
      RULES,
    )
    expect(inputs).toEqual({
      balance: 4758.34,
      payoutBuffer: 2100,
      payoutCap: 2000,
      largestProfitDay: 359,
      currentNetProfit: 6.6,
      consistencyRequirement: 0.5,
    })
  })

  it('derives day-by-day numbers from the ledger', () => {
    const source = {
      approach: 'dayByDay' as const,
      balance: '4758.34',
      largestProfitDay: '',
      netProfit: '',
    }
    const afterPayout = deriveInputs(
      { ...source, payoutTaken: true },
      summarize(days),
      RULES,
    )
    expect(afterPayout).toMatchObject({
      balance: 4758.34,
      largestProfitDay: 359,
      currentNetProfit: 6.6,
    })

    // Before any payout the balance is the sum of the logged days.
    const beforePayout = deriveInputs(
      { ...source, payoutTaken: false },
      summarize(days),
      RULES,
    )
    expect(beforePayout.balance).toBe(6.6)
  })
})

describe('legacySetup', () => {
  beforeEach(() => window.localStorage.clear())

  it('returns nothing on a first visit', () => {
    expect(legacySetup()).toBeNull()
  })

  it('returns nothing when the only stored days list is empty', () => {
    window.localStorage.setItem('mpc.days', '[]')
    expect(legacySetup()).toBeNull()
  })

  it('keeps returning users on day-by-day with their entered balance', () => {
    window.localStorage.setItem(
      'mpc.days',
      JSON.stringify([{ id: 'a', date: '2026-09-08', amount: '359' }]),
    )
    expect(legacySetup()).toEqual({
      approach: 'dayByDay',
      payoutTaken: true,
      strategy: 'conservative',
    })
  })
})
