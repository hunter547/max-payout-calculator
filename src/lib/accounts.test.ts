import { describe, expect, it } from 'vitest'
import { BRAND_THEMES } from './themes'
import {
  accountFor,
  accountTemplate,
  ACCOUNT_TEMPLATES,
  DEFAULT_TEMPLATE,
  accountLabel,
  accountsFor,
  ACCOUNT_PROGRAMS,
  defaultBuffer,
  DEFAULT_PAYOUT_BUFFER,
  drawdownRoomAt,
  firmOf,
  roomIsThin,
  FIRMS,
  hasSchedule,
  nextPayoutNumber,
  payoutCap,
  payoutThreshold,
  programOf,
  programsFor,
  rulesFor,
  scheduleFor,
  sizesFor,
  templateLabel,
} from './accounts'

describe('account templates', () => {
  it('keeps the workbook account as the default', () => {
    const template = accountTemplate(DEFAULT_TEMPLATE)
    expect(templateLabel(template)).toBe('MyFundedFutures 50k Builder')
    expect(template).toMatchObject({
      startingBalance: 0,
      consistency: 0.5,
      minTradingDays: 2,
    })
    // The sheet's payout buffer is the floor and its payout cap the one
    // withdrawal cap, so they still add to the workbook's $4,100.
    expect(template.payout).toMatchObject({
      caps: [2000],
      floor: 2100,
      minimumPayout: 500,
    })
    expect(payoutThreshold(template.payout, 0)).toBe(4100)
    expect(hasSchedule(template)).toBe(false)
  })

  it('carries the Tradeify Growth rules', () => {
    const sizes = [
      ['tradeify-25k-growth', 25000, 26500, 250],
      ['tradeify-50k-growth', 50000, 53000, 500],
      ['tradeify-100k-growth', 100000, 104500, 1000],
      ['tradeify-150k-growth', 150000, 156500, 1500],
    ] as const

    for (const [id, startingBalance, qualifyingBalance, minimumPayout] of sizes) {
      const template = accountTemplate(id)
      expect(template).toMatchObject({
        programId: 'tradeify-growth',
        startingBalance,
        consistency: 0.35,
        minTradingDays: 5,
      })
      expect(template.payout).toMatchObject({
        qualifyingBalance,
        minimumPayout,
        // The trailing drawdown locks $100 above the account size.
        floor: startingBalance + 100,
      })
      // A first payout needs the firm's published minimum balance.
      expect(payoutThreshold(template.payout, 0)).toBe(qualifyingBalance)
    }
  })

  it('graduates the payout cap by how many have been taken', () => {
    const growth50k = accountTemplate('tradeify-50k-growth').payout
    expect(growth50k.caps).toEqual([1500, 2000, 2500, 3000])
    expect([0, 1, 2, 3, 9].map((n) => payoutCap(growth50k, n))).toEqual([
      1500, 2000, 2500, 3000, 3000,
    ])
    expect(nextPayoutNumber(0)).toBe(1)
    expect(nextPayoutNumber(3)).toBe(4)

    // A $3,000 withdrawal cannot leave the balance at or below the $50,100
    // floor, so the fourth payout needs more than the published minimum.
    expect([0, 1, 2, 3].map((n) => payoutThreshold(growth50k, n, 0))).toEqual([
      53000, 53000, 53000, 53100,
    ])

    // A flat schedule stays put.
    const growth25k = accountTemplate('tradeify-25k-growth').payout
    expect([0, 5].map((n) => payoutCap(growth25k, n))).toEqual([1000, 1000])
  })

  it('leaves drawdown room above a floor that breaches', () => {
    const growth50k = accountTemplate('tradeify-50k-growth').payout
    expect(growth50k.floorBreaches).toBe(true)

    // $53,100 would land exactly on the $50,100 floor, which fails the
    // account, so the room is added on top.
    expect(payoutThreshold(growth50k, 3, 0)).toBe(53100)
    expect(payoutThreshold(growth50k, 3, 100)).toBe(53200)
    expect(payoutThreshold(growth50k, 3, 500)).toBe(53600)
    expect(drawdownRoomAt(growth50k, 3, 53200)).toBe(100)

    // Where the firm's own qualifying balance already leaves room, it wins
    // and the room asks for nothing extra: the article's own example.
    expect(payoutThreshold(growth50k, 0, 100)).toBe(53000)
    expect(drawdownRoomAt(growth50k, 0, 53000)).toBe(1400)

    // The workbook's payout buffer is withheld, not a fail level, so its
    // threshold is the buffer plus the cap however much room is asked for.
    const builder = accountTemplate('mffu-50k-builder').payout
    expect(builder.floorBreaches).toBeUndefined()
    expect(payoutThreshold(builder, 0, 500)).toBe(4100)
    expect(drawdownRoomAt(builder, 0, 4100)).toBeNull()
  })

  it('calls the room thin against the drawdown the account started with', () => {
    const template = accountTemplate('tradeify-50k-growth')
    // A 50k Growth has $2,000 of drawdown, so a quarter of it is $500.
    expect(template.drawdown).toBe(2000)
    expect(roomIsThin(template, 499)).toBe(true)
    expect(roomIsThin(template, 500)).toBe(false)
    expect(roomIsThin(template, 1400)).toBe(false)

    // The first payout leaves $1,400 on its own; the fourth leaves only the
    // buffer, so that is the one that warns.
    const schedule = template.payout
    const roomAt = (n: number) =>
      drawdownRoomAt(schedule, n, payoutThreshold(schedule, n))
    expect(roomAt(0)).toBe(1400)
    expect(roomIsThin(template, roomAt(0))).toBe(false)
    expect(roomAt(3)).toBe(100)
    expect(roomIsThin(template, roomAt(3))).toBe(true)

    // Nothing to compare against without a published drawdown, and nothing
    // to warn about where the floor is withheld rather than a fail level.
    expect(roomIsThin(accountTemplate('mffu-50k-builder'), 0)).toBe(false)
  })

  it('opens each account on a buffer it would not warn about', () => {
    // A quarter of the drawdown, rounded up to a round figure.
    expect(defaultBuffer(accountTemplate('tradeify-25k-growth'))).toBe(250)
    expect(defaultBuffer(accountTemplate('tradeify-50k-growth'))).toBe(500)
    expect(defaultBuffer(accountTemplate('tradeify-100k-growth'))).toBe(900)
    expect(defaultBuffer(accountTemplate('tradeify-150k-growth'))).toBe(1250)
    // Nothing to scale against on the workbook's account.
    expect(defaultBuffer(accountTemplate('mffu-50k-builder'))).toBe(
      DEFAULT_PAYOUT_BUFFER,
    )

    // Whatever the payout number, the default never warns about itself.
    for (const t of ACCOUNT_TEMPLATES) {
      for (const era of ['current', 'before'] as const) {
        const schedule = scheduleFor(t, era)
        for (let n = 0; n < 8; n++) {
          const buffer = defaultBuffer(t)
          const room = drawdownRoomAt(
            schedule,
            n,
            payoutThreshold(schedule, n, buffer),
          )
          expect(roomIsThin(t, room)).toBe(false)
        }
      }
    }
  })

  it('takes each drawdown from where the firm locks the floor', () => {
    // floor = size + 100, and the lock triggers at size + drawdown + 100, so
    // the two tables have to agree.
    for (const t of ACCOUNT_TEMPLATES) {
      if (t.drawdown === undefined) continue
      expect(t.payout.floor).toBe(t.startingBalance + 100)
      expect(t.drawdown).toBeGreaterThan(0)
    }
    expect(
      ACCOUNT_TEMPLATES.filter((t) => t.programId === 'tradeify-growth').map(
        (t) => t.drawdown,
      ),
    ).toEqual([1000, 2000, 3500, 5000])
  })

  it('keeps the older schedule for accounts bought before the cutoff', () => {
    const template = accountTemplate('tradeify-50k-growth')
    expect(programOf(template).cutoff).toEqual({
      date: 'September 12, 2025',
      time: '8:00 AM EST',
    })

    const before = scheduleFor(template, 'before')
    expect(before.caps).toEqual([1500, 1750, 2000, 2250, 2500, 3000, 25000])
    expect(before.qualifyingBalance).toBe(52100)
    // Its first payout qualifies $900 sooner than the current schedule.
    expect(payoutThreshold(before, 0)).toBe(52100)
    expect(payoutThreshold(scheduleFor(template, 'current'), 0)).toBe(53000)
    // From the seventh, a request can be anything up to $25,000.
    expect(payoutCap(before, 6)).toBe(25000)
    expect(payoutThreshold(before, 6, 0)).toBe(75100)

    // The 25k is not in the before-cutoff table; it has one schedule.
    const growth25k = accountTemplate('tradeify-25k-growth')
    expect(growth25k.before).toBeUndefined()
    expect(scheduleFor(growth25k, 'before')).toBe(growth25k.payout)
  })

  it('offers the schedule question only where it changes something', () => {
    expect(hasSchedule(accountTemplate('tradeify-50k-growth'))).toBe(true)
    expect(hasSchedule(accountTemplate('tradeify-100k-growth'))).toBe(true)
    expect(hasSchedule(accountTemplate('tradeify-150k-growth'))).toBe(true)
    // Flat cap, one schedule.
    expect(hasSchedule(accountTemplate('tradeify-25k-growth'))).toBe(false)
    expect(hasSchedule(accountTemplate('mffu-50k-builder'))).toBe(false)
  })

  it('carries the Builder sizes, which are the same rules halved', () => {
    const sizes = [
      ['mffu-25k-builder', 1100, 1000, 250],
      ['mffu-50k-builder', 2100, 2000, 500],
    ] as const

    for (const [id, floor, cap, minimumPayout] of sizes) {
      const template = accountTemplate(id)
      expect(template).toMatchObject({
        programId: 'mffu-builder',
        // A funded Builder starts at zero and counts profit up.
        startingBalance: 0,
        consistency: 0.5,
        minTradingDays: 2,
        qualifyingDayProfit: 0,
      })
      // The buffer is the max loss limit plus $100, and the firm wants the
      // minimum payout in profit above it.
      expect(template.payout).toMatchObject({ caps: [cap], floor, minimumPayout })
      // The buffer is withheld, not a level the account dies at.
      expect(template.payout.floorBreaches).toBeUndefined()
      // Buffer plus cap, whatever the payout number: the caps are flat.
      expect(payoutThreshold(template.payout, 0)).toBe(floor + cap)
      expect(payoutThreshold(template.payout, 9)).toBe(floor + cap)
      expect(hasSchedule(template)).toBe(false)
    }

    expect(sizesFor('mffu-builder').map((t) => t.name)).toEqual(['25k', '50k'])
  })

  it('sets the profit a day needs to count, by size', () => {
    const bars = ACCOUNT_TEMPLATES.filter(
      (t) => t.programId === 'tradeify-growth',
    ).map((t) => t.qualifyingDayProfit)
    expect(bars).toEqual([100, 150, 200, 250])
    // The workbook's account counts every day traded.
    expect(accountTemplate('mffu-50k-builder').qualifyingDayProfit).toBe(0)
  })

  it('falls back to the default for an unknown id', () => {
    expect(accountTemplate('no-such-account').id).toBe(DEFAULT_TEMPLATE)
  })

  it('turns a template into field values, balance at the start', () => {
    expect(accountFor(accountTemplate('tradeify-100k-growth'))).toEqual({
      balance: '100000',
      startingBalance: '100000',
      payoutThreshold: '104500',
      minimumPayout: '1000',
      consistency: '35',
      minTradingDays: '5',
      qualifyingDayProfit: '200',
    })
  })

  it('writes the schedule and the payout number into the rules', () => {
    const template = accountTemplate('tradeify-50k-growth')
    // Three payouts taken, so the fourth is capped at $3,000, and the
    // default room keeps it off the floor.
    expect(rulesFor(template, 'current', 3).payoutThreshold).toBe('53200')
    expect(rulesFor(template, 'current', 3, 0).payoutThreshold).toBe('53100')
    // The same account bought before the cutoff is on the older table.
    expect(rulesFor(template, 'before', 0).payoutThreshold).toBe('52100')
    expect(rulesFor(template, 'before', 5).payoutThreshold).toBe('53200')
    // Rules that do not depend on the schedule stay put.
    expect(rulesFor(template, 'before', 5)).toMatchObject({
      startingBalance: '50000',
      consistency: '35',
      minTradingDays: '5',
    })
  })

  it('gives every size a registered type and a unique id', () => {
    const ids = ACCOUNT_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of ACCOUNT_TEMPLATES) {
      expect(ACCOUNT_PROGRAMS.map((p) => p.id)).toContain(t.programId)
      expect(sizesFor(t.programId)).toContain(t)
      expect(accountsFor(firmOf(t).id)).toContain(t)
      expect(t.payout.caps.length).toBeGreaterThan(0)
      expect(payoutThreshold(t.payout, 0)).toBeGreaterThan(t.startingBalance)
      // Whatever the payout number, a plan never targets the breach level.
      for (const n of [0, 1, 5, 9]) {
        const room = drawdownRoomAt(t.payout, n, payoutThreshold(t.payout, n))
        if (room !== null) expect(room).toBeGreaterThan(0)
      }
      // A before-cutoff schedule needs a cutoff to go with it.
      if (t.before) expect(programOf(t).cutoff).toBeDefined()
    }
  })

  it('gives every firm a theme, a logo, and at least one account type', () => {
    for (const f of FIRMS) {
      expect(BRAND_THEMES.map((t) => t.id)).toContain(f.themeId)
      expect(f.logo.src).not.toBe('')
      expect(f.logo.alt).toContain(f.name)
      expect(programsFor(f.id).length).toBeGreaterThan(0)
      expect(accountsFor(f.id).length).toBeGreaterThan(0)
    }
  })

  it('splits an account into its size and its type', () => {
    const growth = accountTemplate('tradeify-100k-growth')
    expect(growth.name).toBe('100k')
    expect(programOf(growth).name).toBe('Growth')
    expect(accountLabel(growth)).toBe('100k Growth')
    expect(templateLabel(growth)).toBe('Tradeify 100k Growth')
    expect(sizesFor('tradeify-growth').map((t) => t.name)).toEqual([
      '25k',
      '50k',
      '100k',
      '150k',
    ])
  })
})
