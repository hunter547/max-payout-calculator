import { describe, expect, it } from 'vitest'
import {
  dayQualifies,
  isAmount,
  nextTradingDate,
  parseAmount,
  planStartDate,
  sortByDate,
  suggestDate,
  summarize,
  type DayEntry,
} from './ledger'

const day = (id: string, date: string, amount: string): DayEntry => ({
  id,
  date,
  amount,
})

describe('summarize — qualifying days', () => {
  const days = [
    { id: 'a', date: '2026-09-08', amount: '359' },
    { id: 'b', date: '2026-09-09', amount: '-212.40' },
    { id: 'c', date: '2026-09-10', amount: '150' },
    { id: 'd', date: '2026-09-11', amount: '151' },
    { id: 'e', date: '2026-09-14', amount: '0' },
  ]

  it('counts every logged day where the firm sets no bar', () => {
    const summary = summarize(days)
    expect(summary.tradingDays).toBe(5)
    expect(summary.qualifyingDays).toBe(5)
  })

  it('counts only the days that beat the bar, not those level with it', () => {
    const summary = summarize(days, 150)
    expect(summary.tradingDays).toBe(5)
    // 359 and 151 clear $150; the 150 itself does not, nor the loss or the
    // flat day.
    expect(summary.qualifyingDays).toBe(2)
    expect(dayQualifies(150, 150)).toBe(false)
    expect(dayQualifies(150.01, 150)).toBe(true)
    expect(dayQualifies(-5, 0)).toBe(true)
  })

  it('counts a day on the bar where the firm words it that way', () => {
    // Apex asks for its figure "or more", so the day that Tradeify's "more
    // than" turns away is one of Apex's.
    expect(dayQualifies(100, 100, true)).toBe(true)
    expect(dayQualifies(99.99, 100, true)).toBe(false)

    const days = [
      { id: 'a', date: '2026-09-08', amount: '100' },
      { id: 'b', date: '2026-09-09', amount: '250' },
      { id: 'c', date: '2026-09-10', amount: '99.99' },
    ]
    expect(summarize(days, 100).qualifyingDays).toBe(1)
    expect(summarize(days, 100, true).qualifyingDays).toBe(2)
  })
})

describe('summarize', () => {
  it('derives the spreadsheet inputs from daily entries', () => {
    // A history whose largest day is 359 and whose net profit is 6.6.
    const s = summarize([
      day('a', '2026-09-08', '359'),
      day('b', '2026-09-09', '-212.40'),
      day('c', '2026-09-10', '-140'),
    ])

    expect(s.largestProfitDay).toBe(359)
    expect(s.largestEntryId).toBe('a')
    expect(s.netProfit).toBe(6.6)
    expect(s.tradingDays).toBe(3)
    expect(s.winningDays).toBe(1)
    expect(s.losingDays).toBe(2)
  })

  it('reports no largest day until there is a winning day', () => {
    const s = summarize([day('a', '2026-09-08', '-50')])
    expect(s.largestProfitDay).toBe(0)
    expect(s.largestEntryId).toBeNull()
    expect(s.netProfit).toBe(-50)
  })

  it('handles an empty ledger', () => {
    const s = summarize([])
    expect(s).toMatchObject({
      largestProfitDay: 0,
      largestEntryId: null,
      netProfit: 0,
      tradingDays: 0,
    })
  })

  it('treats half-typed amounts as zero', () => {
    const s = summarize([day('a', '2026-09-08', '-'), day('b', '2026-09-09', '')])
    expect(s.netProfit).toBe(0)
    expect(s.tradingDays).toBe(2)
  })
})

describe('dates', () => {
  it('skips weekends when stepping to the next trading day', () => {
    expect(nextTradingDate('2026-09-10')).toBe('2026-09-11') // Thu -> Fri
    expect(nextTradingDate('2026-09-11')).toBe('2026-09-14') // Fri -> Mon
  })

  it('suggests the trading day after the latest entry', () => {
    const entries = [day('a', '2026-09-10', '1'), day('b', '2026-09-08', '1')]
    expect(suggestDate(entries)).toBe('2026-09-11')
  })

  it('starts the plan on the next trading day, never in the past', () => {
    // Latest entry is well before "today": the plan starts today.
    expect(planStartDate([day('a', '2026-09-01', '1')], '2026-09-10')).toBe(
      '2026-09-10',
    )
    // Latest entry is today: the plan starts on the next trading day.
    expect(planStartDate([day('a', '2026-09-11', '1')], '2026-09-11')).toBe(
      '2026-09-14',
    )
    // Empty ledger on a Saturday: roll forward to Monday.
    expect(planStartDate([], '2026-09-12')).toBe('2026-09-14')
  })

  it('accepts pasted formatting in amounts', () => {
    expect(isAmount('$1,200.50')).toBe(true)
    expect(isAmount('− 50')).toBe(true)
    expect(isAmount('-')).toBe(false)
    expect(isAmount('abc')).toBe(false)
    expect(parseAmount('$1,200.50')).toBe(1200.5)
    expect(parseAmount('−50')).toBe(-50)
  })

  it('sorts entries chronologically without mutating the input', () => {
    const entries = [day('b', '2026-09-10', '1'), day('a', '2026-09-08', '1')]
    expect(sortByDate(entries).map((e) => e.id)).toEqual(['a', 'b'])
    expect(entries[0].id).toBe('b')
  })
})
