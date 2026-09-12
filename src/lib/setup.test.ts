/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  accountFor,
  accountTemplate,
  ACCOUNT_PROGRAMS,
  sizesFor,
} from './accounts'
import { summarize } from './ledger'
import { balanceHint, deriveInputs, legacySetup, stepsFor, toCuratedChoice } from './setup'

const BUILDER = accountFor(accountTemplate('mffu-50k-builder'))
const GROWTH_25K = accountFor(accountTemplate('tradeify-25k-growth'))

describe('stepsFor', () => {
  it('starts with the firm, type and size, then asks point-in-time users for four numbers', () => {
    expect(stepsFor({ approach: 'pointInTime', payoutTaken: null, programId: 'tradeify-growth', templateId: 'tradeify-50k-growth' })).toEqual([
      'firm',
      'program',
      'size',
      'payouts',
      'approach',
      'balance',
      'largest',
      'cumulative',
      'tradingDays',
      'strategy',
    ])
  })

  it('asks day-by-day users for a balance only after a payout', () => {
    expect(stepsFor({ approach: 'dayByDay', payoutTaken: true, programId: 'tradeify-growth', templateId: 'tradeify-50k-growth' })).toEqual([
      'firm',
      'program',
      'size',
      'payouts',
      'approach',
      'payout',
      'balance',
      'days',
      'strategy',
    ])
    expect(stepsFor({ approach: 'dayByDay', payoutTaken: false, programId: 'tradeify-growth', templateId: 'tradeify-50k-growth' })).toEqual([
      'firm',
      'program',
      'size',
      'payouts',
      'approach',
      'payout',
      'days',
      'strategy',
    ])
  })

  it('shows the size screen only where a type comes in more than one', () => {
    for (const program of ACCOUNT_PROGRAMS) {
      const sizes = sizesFor(program.id)
      const steps = stepsFor({
        approach: 'pointInTime',
        payoutTaken: null,
        programId: program.id,
        templateId: sizes[0].id,
      })
      expect(steps.includes('size')).toBe(sizes.length > 1)
    }
  })

  it('drops the size screen for a type that comes in one size', () => {
    // No registered type is single-size today, so this pins the rule itself.
    const steps = stepsFor({
      approach: 'pointInTime',
      payoutTaken: null,
      programId: 'single-size-type',
      templateId: 'mffu-50k-builder',
    })
    expect(steps.slice(0, 3)).toEqual(['firm', 'program', 'approach'])
    expect(steps).not.toContain('size')
  })

  it('keeps the size screen until a type is picked', () => {
    expect(
      stepsFor({ approach: null, payoutTaken: null, programId: '', templateId: '' }),
    ).toContain('size')
  })

  it('asks about the payout schedule only where there is one', () => {
    const steps = (templateId: string, programId: string) =>
      stepsFor({ approach: 'pointInTime', payoutTaken: null, programId, templateId })

    // Graduated caps, and terms that changed on a date.
    expect(steps('tradeify-50k-growth', 'tradeify-growth')).toContain('payouts')
    // One flat cap, one schedule: nothing to ask.
    expect(steps('mffu-50k-builder', 'mffu-builder')).not.toContain('payouts')
    expect(steps('tradeify-25k-growth', 'tradeify-growth')).not.toContain('payouts')
  })
})

describe('balanceHint', () => {
  it('says where the account starts', () => {
    expect(balanceHint('mffu-50k-builder')).toContain('starts at $0')
    expect(balanceHint('tradeify-25k-growth')).toContain('starts at $25,000')
  })
})

describe('deriveInputs', () => {
  const days = [
    { id: 'a', date: '2026-09-08', amount: '359' },
    { id: 'b', date: '2026-09-09', amount: '-212.40' },
    { id: 'c', date: '2026-09-10', amount: '-140' },
  ]

  it('uses point-in-time numbers as typed, with the account rules', () => {
    const inputs = deriveInputs(
      {
        approach: 'pointInTime',
        payoutTaken: false,
        balance: '4758.34',
        largestProfitDay: '359',
        netProfit: '6.6',
        tradingDays: '3',
      },
      summarize([]),
      BUILDER,
    )
    expect(inputs).toEqual({
      balance: 4758.34,
      payoutThreshold: 4100,
      minimumPayout: 500,
      largestProfitDay: 359,
      currentNetProfit: 6.6,
      consistencyRequirement: 0.5,
      minTradingDays: 2,
      tradingDaysSoFar: 3,
      qualifyingDayProfit: 0,
    })
  })

  it('derives day-by-day numbers, including the trading days, from the ledger', () => {
    const source = {
      approach: 'dayByDay' as const,
      balance: '4758.34',
      largestProfitDay: '',
      netProfit: '',
      tradingDays: '',
    }
    expect(
      deriveInputs({ ...source, payoutTaken: true }, summarize(days), BUILDER),
    ).toMatchObject({
      balance: 4758.34,
      largestProfitDay: 359,
      currentNetProfit: 6.6,
      tradingDaysSoFar: 3,
    })
  })

  it('adds the logged days to where the account started, before any payout', () => {
    const source = {
      approach: 'dayByDay' as const,
      payoutTaken: false,
      balance: '',
      largestProfitDay: '',
      netProfit: '',
      tradingDays: '',
    }
    // MyFundedFutures starts at 0, so the balance is the profit itself.
    expect(deriveInputs(source, summarize(days), BUILDER).balance).toBe(6.6)
    // Tradeify starts at the account size.
    expect(deriveInputs(source, summarize(days), GROWTH_25K).balance).toBe(25006.6)
  })

  it('counts only the logged days that clear the firm bar', () => {
    const source = {
      approach: 'dayByDay' as const,
      payoutTaken: true,
      balance: '25400',
      largestProfitDay: '',
      netProfit: '',
      tradingDays: '',
    }
    const logged = [
      { id: 'a', date: '2026-09-08', amount: '300' },
      { id: 'b', date: '2026-09-09', amount: '90' },
      { id: 'c', date: '2026-09-10', amount: '-40' },
    ]
    // MyFundedFutures counts all three; a 25k Growth counts only the $300.
    expect(
      deriveInputs(source, summarize(logged), BUILDER).tradingDaysSoFar,
    ).toBe(3)
    expect(
      deriveInputs(source, summarize(logged, 100), GROWTH_25K).tradingDaysSoFar,
    ).toBe(1)
  })

  it('carries a Tradeify account rules through', () => {
    const inputs = deriveInputs(
      {
        approach: 'pointInTime',
        payoutTaken: false,
        balance: '25400',
        largestProfitDay: '300',
        netProfit: '400',
        tradingDays: '2',
      },
      summarize([]),
      GROWTH_25K,
    )
    expect(inputs).toMatchObject({
      payoutThreshold: 26500,
      minimumPayout: 250,
      consistencyRequirement: 0.35,
      minTradingDays: 5,
      tradingDaysSoFar: 2,
      qualifyingDayProfit: 100,
    })
  })
})

describe('toCuratedChoice', () => {
  it('needs a day count in days mode', () => {
    expect(toCuratedChoice({ mode: 'days', days: null, cap: '' })).toBeNull()
    expect(toCuratedChoice({ mode: 'days', days: 4, cap: '' })).toEqual({
      mode: 'days',
      days: 4,
    })
  })

  it('needs a positive dollar amount in cap mode', () => {
    expect(toCuratedChoice({ mode: 'cap', days: 4, cap: '' })).toBeNull()
    expect(toCuratedChoice({ mode: 'cap', days: 4, cap: '0' })).toBeNull()
    expect(toCuratedChoice({ mode: 'cap', days: 4, cap: 'abc' })).toBeNull()
    expect(toCuratedChoice({ mode: 'cap', days: null, cap: '$700' })).toEqual({
      mode: 'cap',
      cap: 700,
    })
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

  it('keeps returning users on day-by-day on the workbook account', () => {
    window.localStorage.setItem(
      'mpc.days',
      JSON.stringify([{ id: 'a', date: '2026-09-08', amount: '359' }]),
    )
    expect(legacySetup()).toEqual({
      templateId: 'mffu-50k-builder',
      approach: 'dayByDay',
      payoutTaken: true,
      strategy: 'conservative',
    })
  })
})
