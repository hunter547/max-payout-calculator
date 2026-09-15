/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  accountFor,
  accountTemplate,
  ACCOUNT_PROGRAMS,
  sizesFor,
} from './accounts'
import { summarize } from './ledger'
import {
  balanceHint,
  deriveInputs,
  hasTakenPayout,
  impliedTradingDays,
  tradingDaysBind,
  legacySetup,
  stepsFor,
  toCuratedChoice,
} from './setup'

const BUILDER = accountFor(accountTemplate('mffu-50k-builder'))
const GROWTH_25K = accountFor(accountTemplate('tradeify-25k-growth'))

describe('stepsFor', () => {
  it('starts with the firm, type and size, then asks point-in-time users for its numbers', () => {
    const growth = {
      approach: 'pointInTime' as const,
      payoutTaken: null,
      programId: 'tradeify-growth',
      templateId: 'tradeify-50k-growth',
    }
    // Nothing withdrawn yet, so the balance follows from the profit.
    expect(stepsFor({ ...growth, payoutsSoFar: '0' })).toEqual([
      'firm',
      'program',
      'size',
      'payouts',
      'approach',
      'largest',
      'cumulative',
      'tradingDays',
      'strategy',
    ])
    // Once a payout is behind you, it does not.
    expect(stepsFor({ ...growth, payoutsSoFar: '1' })).toEqual([
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

  it('asks a scheduled account for its payout count instead of a yes or no', () => {
    const growth = {
      approach: 'dayByDay' as const,
      payoutTaken: null,
      programId: 'tradeify-growth',
      templateId: 'tradeify-50k-growth',
    }
    // The schedule screen already asked how many payouts are behind you.
    const fresh = stepsFor({ ...growth, payoutsSoFar: '0' })
    expect(fresh).toContain('payouts')
    expect(fresh).not.toContain('payout')
    expect(fresh).not.toContain('balance')
    // And it is asked before the approach, so both cards know the answer.
    expect(fresh.indexOf('payouts')).toBeLessThan(fresh.indexOf('approach'))

    // A count above zero says a payout has been taken, so the balance can no
    // longer be worked out from the logged days.
    const after = stepsFor({ ...growth, payoutsSoFar: '2' })
    expect(after).not.toContain('payout')
    expect(after).toContain('balance')

    // An account with no schedule still gets the yes-or-no screen.
    const builder = stepsFor({
      approach: 'dayByDay',
      payoutTaken: true,
      payoutsSoFar: '0',
      programId: 'mffu-builder',
      templateId: 'mffu-50k-builder',
    })
    expect(builder).toContain('payout')
    expect(builder).not.toContain('payouts')
  })

  it('asks day-by-day users for a balance only after a payout', () => {
    const builder = {
      approach: 'dayByDay' as const,
      payoutsSoFar: '0',
      programId: 'mffu-builder',
      templateId: 'mffu-50k-builder',
    }
    expect(stepsFor({ ...builder, payoutTaken: true })).toEqual([
      'firm',
      'program',
      'size',
      'payout',
      'approach',
      'balance',
      'days',
      'strategy',
    ])
    expect(stepsFor({ ...builder, payoutTaken: false })).toEqual([
      'firm',
      'program',
      'size',
      'payout',
      'approach',
      'days',
      'strategy',
    ])
  })

  it('drops the trading-days screen where the minimum cannot bind', () => {
    // A Builder wants two days, which 50% consistency takes anyway.
    expect(
      stepsFor({
        approach: 'pointInTime',
        payoutTaken: null,
        payoutsSoFar: '0',
        programId: 'mffu-builder',
        templateId: 'mffu-50k-builder',
      }),
    ).not.toContain('tradingDays')
  })

  it('drops the trading-days screen where a firm sets no minimum', () => {
    const steps = stepsFor({
      approach: 'pointInTime',
      payoutTaken: null,
      payoutsSoFar: '0',
      programId: 'tradeify-lightning',
      templateId: 'tradeify-50k-lightning',
    })
    // Lightning has no minimum trading days, so there is nothing to ask.
    expect(steps).not.toContain('tradingDays')
    expect(steps).toContain('cumulative')
    // Growth does have one.
    expect(
      stepsFor({
        approach: 'pointInTime',
        payoutTaken: null,
        payoutsSoFar: '0',
        programId: 'tradeify-growth',
        templateId: 'tradeify-50k-growth',
      }),
    ).toContain('tradingDays')
  })

  it('shows the size screen only where a type comes in more than one', () => {
    for (const program of ACCOUNT_PROGRAMS) {
      const sizes = sizesFor(program.id)
      const steps = stepsFor({
        approach: 'pointInTime',
        payoutTaken: null,
        payoutsSoFar: '0',
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
      payoutsSoFar: '0',
      programId: 'single-size-type',
      templateId: 'mffu-50k-builder',
    })
    expect(steps.slice(0, 3)).toEqual(['firm', 'program', 'payout'])
    expect(steps).not.toContain('size')
  })

  it('keeps the size screen until a type is picked', () => {
    expect(
      stepsFor({ approach: null, payoutTaken: null, payoutsSoFar: '0', programId: '', templateId: '' }),
    ).toContain('size')
  })

  it('asks about the payout schedule only where there is one', () => {
    const steps = (templateId: string, programId: string) =>
      stepsFor({
        approach: 'pointInTime',
        payoutTaken: null,
        payoutsSoFar: '0',
        programId,
        templateId,
      })

    // Graduated caps, and terms that changed on a date.
    expect(steps('tradeify-50k-growth', 'tradeify-growth')).toContain('payouts')
    // One flat cap, one schedule: nothing to ask.
    expect(steps('mffu-50k-builder', 'mffu-builder')).not.toContain('payouts')
    expect(steps('tradeify-25k-growth', 'tradeify-growth')).not.toContain('payouts')
  })
})

describe('tradingDaysBind', () => {
  it('counts the days a consistency rule takes on its own', () => {
    // No day may top G of the net, so the net takes at least 1 / G days.
    expect(impliedTradingDays(0.5)).toBe(2)
    expect(impliedTradingDays(0.35)).toBe(3)
    expect(impliedTradingDays(0.2)).toBe(5)
    expect(impliedTradingDays(0)).toBe(0)
  })

  it('binds only where a firm asks for more days than that', () => {
    // A Builder wants two days at 50%, which two days of trading give you.
    expect(tradingDaysBind(2, 0.5)).toBe(false)
    // A Growth wants five at 35%, which takes three.
    expect(tradingDaysBind(5, 0.35)).toBe(true)
    // Lightning sets none at all.
    expect(tradingDaysBind(0, 0.2)).toBe(false)
    // An edited rule can make it bind again.
    expect(tradingDaysBind(9, 0.5)).toBe(true)
  })

  it('takes the minimum as met where it cannot bind', () => {
    const source = {
      approach: 'pointInTime' as const,
      payoutTaken: false,
      balance: '4758.34',
      largestProfitDay: '359',
      netProfit: '6.6',
      tradingDays: '',
    }
    // Nothing typed, and nothing missing: the rule is covered by definition.
    expect(deriveInputs(source, summarize([]), BUILDER).tradingDaysSoFar).toBe(2)
    // Where it binds, what the trader typed is what counts.
    expect(
      deriveInputs({ ...source, tradingDays: '2' }, summarize([]), GROWTH_25K)
        .tradingDaysSoFar,
    ).toBe(2)
  })
})

describe('hasTakenPayout', () => {
  it('reads the payout count where there is one, the answer where there is not', () => {
    const growth = { templateId: 'tradeify-50k-growth', payoutTaken: null }
    expect(hasTakenPayout({ ...growth, payoutsSoFar: '0' })).toBe(false)
    expect(hasTakenPayout({ ...growth, payoutsSoFar: '1' })).toBe(true)
    // Even a yes is overruled by a count of none: they cannot both be true.
    expect(
      hasTakenPayout({ ...growth, payoutTaken: true, payoutsSoFar: '0' }),
    ).toBe(false)

    const builder = { templateId: 'mffu-50k-builder', payoutsSoFar: '3' }
    expect(hasTakenPayout({ ...builder, payoutTaken: true })).toBe(true)
    expect(hasTakenPayout({ ...builder, payoutTaken: false })).toBe(false)
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
        payoutTaken: true,
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
      // The firm's own day wording, which a Builder does not set.
      qualifyingDayInclusive: undefined,
      minQualifyingDays: undefined,
      // Two days at 50% is what the consistency rule takes anyway, so the
      // count is never asked for and never short.
      tradingDaysSoFar: 2,
      qualifyingDaysSoFar: 2,
      qualifyingDayProfit: 0,
      profitGoal: 0,
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
    // The balance entered is where the cycle began — what the last payout
    // left — so the days logged since are added onto it. Logging another day
    // has to move the balance, or the plan keeps asking for profit already
    // made.
    expect(
      deriveInputs({ ...source, payoutTaken: true }, summarize(days), BUILDER),
    ).toMatchObject({
      balance: 4764.94,
      largestProfitDay: 359,
      currentNetProfit: 6.6,
      tradingDaysSoFar: 3,
    })

    // One more winning day, and the balance is that much higher.
    const more = [...days, { id: 'd', date: '2026-09-11', amount: '500' }]
    expect(
      deriveInputs({ ...source, payoutTaken: true }, summarize(more), BUILDER),
    ).toMatchObject({ balance: 5264.94, currentNetProfit: 506.6 })
  })

  it('works a point-in-time balance out of the profit before any payout', () => {
    const source = {
      approach: 'pointInTime' as const,
      payoutTaken: false,
      // Typed earlier, then made irrelevant by answering "no payout yet".
      balance: '99999',
      largestProfitDay: '359',
      netProfit: '6.6',
      tradingDays: '3',
    }
    // A Builder starts at zero, so its balance is the profit itself.
    expect(deriveInputs(source, summarize([]), BUILDER).balance).toBe(6.6)
    // A Growth starts at the account size.
    expect(deriveInputs(source, summarize([]), GROWTH_25K).balance).toBe(25006.6)
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

  it('keeps returning users on day-by-day on the default account', () => {
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
