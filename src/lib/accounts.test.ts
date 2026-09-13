import { describe, expect, it } from 'vitest'
import { tradingDaysBind } from './setup'
import { BRAND_THEMES } from './themes'
import {
  accountFor,
  accountTemplate,
  ACCOUNT_TEMPLATES,
  DEFAULT_TEMPLATE,
  accountLabel,
  accountsFor,
  ACCOUNT_PROGRAMS,
  consistencyFor,
  defaultBuffer,
  floorBreachesAt,
  floorAt,
  DEFAULT_PAYOUT_BUFFER,
  drawdownRoomAt,
  graduates,
  firmOf,
  roomIsThin,
  FIRMS,
  hasSchedule,
  maxPayoutFor,
  nextPayoutNumber,
  payoutCap,
  payoutsSpent,
  payoutThreshold,
  profitGoal,
  programOf,
  programsFor,
  rulesFor,
  scheduleFor,
  sizesFor,
  templateLabel,
  type Terms,
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

  it('carries the Apex EOD and Intraday payout tables', () => {
    // Account size, drawdown, the daily profit a day must make on each
    // program, and the balance Apex publishes as the minimum to request.
    const sizes = [
      ['25k', 25000, 1000, 100, 100, 26600],
      ['50k', 50000, 2000, 250, 200, 52600],
      ['100k', 100000, 3000, 300, 250, 103600],
      ['150k', 150000, 4000, 350, 300, 154600],
    ] as const

    for (const [size, start, drawdown, eodBar, intradayBar, minimum] of sizes) {
      for (const [program, bar] of [
        ['eod', eodBar],
        ['intraday', intradayBar],
      ] as const) {
        const template = accountTemplate(`apex-${size}-${program}`)
        expect(template).toMatchObject({
          programId: `apex-${program}`,
          startingBalance: start,
          consistency: 0.5,
          minTradingDays: 5,
          qualifyingDayProfit: bar,
          // Apex counts a day that lands exactly on its figure.
          qualifyingDayInclusive: true,
          drawdown,
        })
        expect(template.payout).toMatchObject({
          minimumPayout: 500,
          qualifyingBalance: minimum,
          // The safety net is the drawdown plus $100, held for the life of
          // the account, and the published minimum is that plus the $500.
          floor: start + drawdown + 100,
        })
        expect(template.payout.floor! + 500).toBe(minimum)
      }
    }
  })

  it('graduates the Apex cap differently on EOD and Intraday', () => {
    // Apex's published max-payout tables, payouts one through six.
    expect(accountTemplate('apex-50k-eod').payout.caps).toEqual([
      1500, 1500, 2000, 2500, 2500, 3000,
    ])
    expect(accountTemplate('apex-50k-intraday').payout.caps).toEqual([
      1500, 2000, 2500, 2500, 3000, 3000,
    ])
    expect(accountTemplate('apex-150k-eod').payout.caps).toEqual([
      2500, 3000, 3000, 3000, 4000, 5000,
    ])
    expect(accountTemplate('apex-150k-intraday').payout.caps).toEqual([
      2500, 3000, 3000, 4000, 4000, 5000,
    ])
    // The 25k is flat at $1,000 on both, which one entry says.
    expect(accountTemplate('apex-25k-eod').payout.caps).toEqual([1000])

    // A later, bigger cap asks for a bigger balance: the floor plus the cap.
    const eod = accountTemplate('apex-50k-eod').payout
    expect(payoutThreshold(eod, 0)).toBe(53600)
    expect(payoutThreshold(eod, 5)).toBe(55100)
  })

  it('carries the Apex legacy payout parameters', () => {
    // Size, drawdown, the cap on the first five payouts, and the balance
    // Apex publishes as the minimum to request.
    const sizes = [
      ['25k', 25000, 1500, 1500, 26600],
      ['50k', 50000, 2500, 2000, 52600],
      ['100k', 100000, 3000, 2500, 103100],
      ['150k', 150000, 5000, 2750, 155100],
      ['250k', 250000, 6500, 3000, 256600],
      ['300k', 300000, 7500, 3500, 307600],
    ] as const

    for (const [size, start, drawdown, cap, minimum] of sizes) {
      const template = accountTemplate(`apex-${size}-legacy`)
      expect(template).toMatchObject({
        programId: 'apex-legacy',
        startingBalance: start,
        consistency: 0.3,
        // Eight trading days in all, five of them making $50 or more.
        minTradingDays: 8,
        qualifyingDayProfit: 50,
        qualifyingDayInclusive: true,
        minQualifyingDays: 5,
        drawdown,
      })
      expect(template.payout.qualifyingBalance).toBe(minimum)
      // Apex's published minimum is the safety net itself, because a payout
      // may take the $500 minimum out of it; the floor sits that far below.
      expect(minimum).toBe(start + drawdown + 100)
      expect(template.payout.floors).toEqual([
        minimum - 500,
        minimum - 500,
        minimum - 500,
        start + 100,
      ])
      // Capped for five payouts, then not capped at all.
      expect(payoutCap(template.payout, 0)).toBe(cap)
      expect(payoutCap(template.payout, 4)).toBe(cap)
      expect(payoutCap(template.payout, 5)).toBe(Infinity)
    }
  })

  it('drops the Apex legacy safety net after three payouts', () => {
    const legacy = accountTemplate('apex-50k-legacy')
    const schedule = legacy.payout

    // Through the third, the floor is the safety net less the $500 a payout
    // may take out of it, so a max payout lands there.
    expect(floorAt(schedule, 0)).toBe(52100)
    expect(payoutThreshold(schedule, 0)).toBe(54100)
    expect(maxPayoutFor(schedule, 0, 54100)).toBe(2000)

    // From the fourth there is no net, only the trailing drawdown's own stop
    // at the starting balance plus $100 — which a payout must not land on.
    expect(floorAt(schedule, 3)).toBe(50100)
    expect(floorBreachesAt(schedule, 0)).toBe(false)
    expect(floorBreachesAt(schedule, 3)).toBe(true)
    const buffer = defaultBuffer(legacy)
    expect(payoutThreshold(schedule, 3, buffer)).toBe(50100 + 2000 + buffer)

    // Uncapped from the sixth: the balance above the floor is the only
    // limit, less the buffer, since landing on that floor fails the account.
    expect(payoutCap(schedule, 5)).toBe(Infinity)
    expect(maxPayoutFor(schedule, 5, 60000, buffer)).toBe(60000 - 50100 - buffer)
    // With no cap to reach for, the balance it wants is the smallest request
    // — but Apex's published minimum to request still stands above that, and
    // its help center never says that minimum lapses with the net, so it is
    // taken to hold and the higher of the two wins.
    expect(50100 + 500 + buffer).toBeLessThan(52600)
    expect(payoutThreshold(schedule, 5, buffer)).toBe(52600)
  })

  it('ends an Apex EOD or Intraday account after its sixth payout', () => {
    const eod = accountTemplate('apex-50k-eod').payout
    expect(eod.maxPayouts).toBe(6)
    expect(payoutsSpent(eod, 4)).toBe(false)
    // Five taken, so the sixth is still to come.
    expect(payoutsSpent(eod, 5)).toBe(false)
    expect(payoutsSpent(eod, 6)).toBe(true)

    // Legacy carries on instead: Apex stops capping rather than closing it.
    const legacy = accountTemplate('apex-50k-legacy').payout
    expect(legacy.maxPayouts).toBeUndefined()
    expect(payoutsSpent(legacy, 9)).toBe(false)
    // And nothing else in the registry ends on a count.
    for (const t of ACCOUNT_TEMPLATES) {
      if (!t.programId.startsWith('apex-')) {
        expect(t.payout.maxPayouts).toBeUndefined()
      }
    }
  })

  it('lets the Apex legacy consistency rule lapse after six payouts', () => {
    const legacy = accountTemplate('apex-50k-legacy')
    expect(consistencyFor(legacy, 'base', 0)).toBe(0.3)
    expect(consistencyFor(legacy, 'base', 5)).toBe(0.3)
    // A single day may be the whole profit once the rule is behind you.
    expect(consistencyFor(legacy, 'base', 6)).toBe(1)
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
      for (const era of ['base', 'alt'] as const) {
        const schedule = scheduleFor(t, era)
        for (let n = 0; n < 8; n++) {
          const buffer = defaultBuffer(t)
          const room = drawdownRoomAt(
            schedule,
            n,
            payoutThreshold(schedule, n, buffer),
            buffer,
          )
          expect(roomIsThin(t, room)).toBe(false)
        }
      }
    }
  })

  it('takes each drawdown from where the firm locks the floor', () => {
    // Where a firm withholds the lock itself, floor = size + 100 and the lock
    // triggers at size + drawdown + 100, so the two tables have to agree.
    // Apex withholds its safety net instead, which is the lock plus the
    // drawdown; its legacy accounts drop to the lock once the net lapses.
    for (const t of ACCOUNT_TEMPLATES) {
      if (t.drawdown === undefined) continue
      expect(t.drawdown).toBeGreaterThan(0)
      const net = t.startingBalance + t.drawdown + 100
      if (t.programId.startsWith('apex-')) {
        const floors = t.payout.floors
        expect(floors ? floors[0] : t.payout.floor).toBe(
          floors ? net - t.payout.minimumPayout : net,
        )
        if (floors) expect(floors[floors.length - 1]).toBe(t.startingBalance + 100)
      } else {
        expect(t.payout.floor).toBe(t.startingBalance + 100)
      }
    }
    expect(
      ACCOUNT_TEMPLATES.filter((t) => t.programId === 'tradeify-growth').map(
        (t) => t.drawdown,
      ),
    ).toEqual([1000, 2000, 3500, 5000])
  })

  it('keeps the older schedule for accounts bought before the cutoff', () => {
    const template = accountTemplate('tradeify-50k-growth')
    expect(programOf(template).variant).toMatchObject({
      question: 'When did you buy this account?',
      base: 'On or after September 12, 2025',
      alt: 'Before it',
    })

    const before = scheduleFor(template, 'alt')
    expect(before.caps).toEqual([1500, 1750, 2000, 2250, 2500, 3000, 25000])
    expect(before.qualifyingBalance).toBe(52100)
    // Its first payout qualifies $900 sooner than the current schedule.
    expect(payoutThreshold(before, 0)).toBe(52100)
    expect(payoutThreshold(scheduleFor(template, 'base'), 0)).toBe(53000)
    // From the seventh, a request can be anything up to $25,000.
    expect(payoutCap(before, 6)).toBe(25000)
    expect(payoutThreshold(before, 6, 0)).toBe(75100)

    // The 25k is not in the before-cutoff table; it has one schedule.
    const growth25k = accountTemplate('tradeify-25k-growth')
    expect(growth25k.alt).toBeUndefined()
    expect(scheduleFor(growth25k, 'alt')).toBe(growth25k.payout)
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

  it('carries the Lightning rules, which move with the payout number', () => {
    const template = accountTemplate('tradeify-50k-lightning')
    expect(template).toMatchObject({
      programId: 'tradeify-lightning',
      startingBalance: 50000,
      // Straight to funded, with no minimum trading days at all.
      minTradingDays: 0,
      drawdown: 2000,
    })

    // A payout unlocks on profit earned since the last one, not on balance.
    expect(template.payout.qualifyingBalance).toBe(0)
    expect([0, 1, 2, 5].map((n) => profitGoal(template.payout, n))).toEqual([
      3000, 2000, 2000, 2000,
    ])
    // The cap holds for three payouts, then rises once.
    expect([0, 1, 2, 3].map((n) => payoutCap(template.payout, n))).toEqual([
      2000, 2000, 2000, 2500,
    ])
    // And the consistency rule tightens as the payouts add up.
    expect([0, 1, 2, 9].map((n) => consistencyFor(template, 'base', n))).toEqual([
      0.2, 0.25, 0.3, 0.3,
    ])
    // Accounts bought before the cutoff keep 20% throughout.
    expect([0, 1, 9].map((n) => consistencyFor(template, 'alt', n))).toEqual([
      0.2, 0.2, 0.2,
    ])
    expect(hasSchedule(template)).toBe(true)
  })

  it('keeps the older profit goals for Lightning bought before the cutoff', () => {
    // The two larger sizes had a third, lower goal from the third payout on.
    const goals = (id: string, terms: Terms) =>
      [0, 1, 2, 3].map((n) => profitGoal(scheduleFor(accountTemplate(id), terms), n))

    expect(goals('tradeify-100k-lightning', 'base')).toEqual([
      6000, 3500, 3500, 3500,
    ])
    expect(goals('tradeify-100k-lightning', 'alt')).toEqual([
      6000, 3000, 2500, 2500,
    ])
    expect(goals('tradeify-150k-lightning', 'alt')).toEqual([
      9000, 4500, 3000, 3000,
    ])
  })

  it('writes the payout number into the consistency rule as well', () => {
    const template = accountTemplate('tradeify-50k-lightning')
    expect(rulesFor(template, 'base', 0)).toMatchObject({
      profitGoal: '3000',
      consistency: '20',
      minTradingDays: '0',
    })
    expect(rulesFor(template, 'base', 1)).toMatchObject({
      profitGoal: '2000',
      consistency: '25',
    })
    expect(rulesFor(template, 'base', 2).consistency).toBe('30')
    expect(rulesFor(template, 'alt', 2).consistency).toBe('20')
    // Accounts whose rule never moves keep writing their own.
    expect(rulesFor(accountTemplate('tradeify-50k-growth')).consistency).toBe('35')
    expect(rulesFor(accountTemplate('mffu-50k-builder')).profitGoal).toBe('0')
  })

  it('carries the Topstep XFA Consistency rules', () => {
    const sizes = [
      ['topstep-50k-xfa-consistency', 3000, 6000],
      ['topstep-100k-xfa-consistency', 4000, 8000],
      ['topstep-150k-xfa-consistency', 6000, 12000],
    ] as const

    for (const [id, cap, withDll] of sizes) {
      const template = accountTemplate(id)
      expect(template).toMatchObject({
        programId: 'topstep-xfa-consistency',
        // An Express Funded Account counts profit up from zero.
        startingBalance: 0,
        consistency: 0.4,
        minTradingDays: 3,
        qualifyingDayProfit: 0,
      })
      expect(template.payout).toMatchObject({
        caps: [cap],
        minimumPayout: 125,
        withdrawShare: 0.5,
        floor: 0,
      })
      // A Daily Loss Limit added at checkout doubles the cap.
      expect(template.alt?.caps).toEqual([withDll])

      // Half the balance has to cover the cap, so the balance is twice it.
      expect(payoutThreshold(template.payout, 0)).toBe(cap * 2)
      expect(payoutThreshold(scheduleFor(template, 'alt'), 0)).toBe(withDll * 2)
    }
  })

  it('asks the DLL question rather than a purchase date', () => {
    const template = accountTemplate('topstep-50k-xfa-consistency')
    expect(programOf(template).variant).toMatchObject({
      question: 'Did you add a Daily Loss Limit?',
      base: 'No DLL',
      alt: 'DLL added',
    })
    // Two sets of terms, but nothing that moves with the payout number.
    expect(hasSchedule(template)).toBe(true)
    expect(graduates(template.payout)).toBe(false)
    expect([0, 1, 5].map((n) => payoutCap(template.payout, n))).toEqual([
      3000, 3000, 3000,
    ])
  })

  it('never asks Topstep for trading days its consistency rule takes', () => {
    // Three days at 40%: exactly what the rule forces on its own.
    const template = accountTemplate('topstep-50k-xfa-consistency')
    expect(template.minTradingDays).toBe(3)
    expect(tradingDaysBind(template.minTradingDays, template.consistency)).toBe(
      false,
    )
  })

  it('says the most a payout may actually be', () => {
    // A Builder: the cap, unless the balance cannot spare it above the buffer.
    const builder = accountTemplate('mffu-50k-builder').payout
    expect(maxPayoutFor(builder, 0, 4758.34)).toBe(2000)
    expect(maxPayoutFor(builder, 0, 3500)).toBe(1400) // 3500 - the 2100 buffer
    expect(maxPayoutFor(builder, 0, 2100)).toBe(0)

    // Topstep also caps it at half the balance.
    const topstep = accountTemplate('topstep-50k-xfa-consistency').payout
    expect(maxPayoutFor(topstep, 0, 12000)).toBe(3000) // the cap
    expect(maxPayoutFor(topstep, 0, 4000)).toBe(2000) // half the balance
    expect(maxPayoutFor(scheduleFor(accountTemplate('topstep-50k-xfa-consistency'), 'alt'), 0, 12000)).toBe(6000)

    // And a graduated cap follows the payout number.
    const growth = accountTemplate('tradeify-50k-growth').payout
    expect(maxPayoutFor(growth, 0, 53000)).toBe(1500)
    expect(maxPayoutFor(growth, 3, 53600)).toBe(3000)
  })

  it('reproduces the LucidPro table of balances for a max payout', () => {
    // Their own columns: the buffer a payout may not come out of, the cap on
    // the first payout and on every one after, and the balance each needs.
    const table = [
      ['lucid-25k-pro', 25000, 26100, 250, 1000, 27100, 1500, 27600],
      ['lucid-50k-pro', 50000, 52100, 500, 2000, 54100, 2500, 54600],
      ['lucid-100k-pro', 100000, 103100, 750, 2500, 105600, 3000, 106100],
      ['lucid-150k-pro', 150000, 154600, 1000, 3000, 157600, 3500, 158100],
    ] as const

    for (const [id, size, buffer, goal, first, forFirst, later, forLater] of table) {
      const template = accountTemplate(id)
      expect(template).toMatchObject({
        programId: 'lucid-pro',
        startingBalance: size,
        consistency: 0.4,
        // No day count at all, and no profit bar on a day.
        minTradingDays: 0,
        qualifyingDayProfit: 0,
      })
      expect(template.payout).toMatchObject({
        minimumPayout: 500,
        floor: buffer,
      })
      // The buffer is the max loss limit plus $100.
      expect(buffer - size - 100).toBeGreaterThan(0)

      // The profit goal between cycles, flat whatever the payout number.
      expect([0, 1, 4].map((n) => profitGoal(template.payout, n))).toEqual([
        goal,
        goal,
        goal,
      ])

      // The cap rises once after the first payout, and the balance each takes
      // is the buffer plus that cap.
      expect(payoutCap(template.payout, 0)).toBe(first)
      expect(payoutThreshold(template.payout, 0)).toBe(forFirst)
      expect(payoutCap(template.payout, 1)).toBe(later)
      expect(payoutThreshold(template.payout, 1)).toBe(forLater)
      expect(payoutThreshold(template.payout, 9)).toBe(forLater)

      // The buffer is withheld rather than a level the account dies at, so
      // no extra room is asked for on top.
      expect(template.payout.floorBreaches).toBeUndefined()
      expect(drawdownRoomAt(template.payout, 0, forFirst)).toBeNull()
    }
  })

  it('gates LucidDirect on profit alone, with no balance to reach', () => {
    const table = [
      ['lucid-25k-direct', 25000, 1500, 1250, 1000, 1000],
      ['lucid-50k-direct', 50000, 3000, 2500, 2000, 2500],
      ['lucid-100k-direct', 100000, 6000, 3500, 2500, 3000],
      ['lucid-150k-direct', 150000, 9000, 4500, 3000, 3500],
    ] as const

    for (const [id, size, goal1, goal2, cap1, cap4] of table) {
      const template = accountTemplate(id)
      expect(template).toMatchObject({
        programId: 'lucid-direct',
        startingBalance: size,
        // A tighter rule than Pro's, and still no day count.
        consistency: 0.2,
        minTradingDays: 0,
      })

      // The goal falls after the first payout, and the cap rises after the
      // third — which they publish as payouts 1-3 and 4-5.
      expect([0, 1, 4].map((n) => profitGoal(template.payout, n))).toEqual([
        goal1,
        goal2,
        goal2,
      ])
      expect([0, 1, 2, 3, 4].map((n) => payoutCap(template.payout, n))).toEqual([
        cap1,
        cap1,
        cap1,
        cap4,
        cap4,
      ])

      // No buffer, no qualifying balance, no share: nothing to reach.
      expect(template.payout.floor).toBeUndefined()
      expect(template.payout.qualifyingBalance).toBeUndefined()
      expect(payoutThreshold(template.payout, 0)).toBe(0)
      // Which leaves the profit goal to set the target.
      expect(goal1).toBeGreaterThanOrEqual(cap1)
    }
  })

  it('asks LucidPro where it is in its payouts, and nothing else', () => {
    const template = accountTemplate('lucid-50k-pro')
    // The cap moves with the payout number, so the count is worth asking.
    expect(hasSchedule(template)).toBe(true)
    expect(graduates(template.payout)).toBe(true)
    // There is no second set of terms to tell apart.
    expect(template.alt).toBeUndefined()
    expect(programOf(template).variant).toBeUndefined()
    // And 40% consistency takes three days on its own, so its lack of a
    // minimum changes nothing.
    expect(tradingDaysBind(0, 0.4)).toBe(false)
  })

  it('falls back to the default for an unknown id', () => {
    expect(accountTemplate('no-such-account').id).toBe(DEFAULT_TEMPLATE)
  })

  it('turns a template into field values, balance at the start', () => {
    expect(accountFor(accountTemplate('tradeify-100k-growth'))).toEqual({
      balance: '100000',
      startingBalance: '100000',
      payoutThreshold: '104500',
      profitGoal: '0',
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
    expect(rulesFor(template, 'base', 3).payoutThreshold).toBe('53200')
    expect(rulesFor(template, 'base', 3, 0).payoutThreshold).toBe('53100')
    // The same account bought before the cutoff is on the older table.
    expect(rulesFor(template, 'alt', 0).payoutThreshold).toBe('52100')
    expect(rulesFor(template, 'alt', 5).payoutThreshold).toBe('53200')
    // Rules that do not depend on the schedule stay put.
    expect(rulesFor(template, 'alt', 5)).toMatchObject({
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
      // A balance to reach, or a profit goal instead of one.
      const threshold = payoutThreshold(t.payout, 0)
      if (threshold > 0) expect(threshold).toBeGreaterThan(t.startingBalance)
      else expect(profitGoal(t.payout, 0)).toBeGreaterThan(0)
      // Whatever the payout number, a plan never targets the breach level.
      for (const n of [0, 1, 5, 9]) {
        const room = drawdownRoomAt(t.payout, n, payoutThreshold(t.payout, n))
        if (room !== null) expect(room).toBeGreaterThan(0)
      }
      // A second schedule needs a question to tell the two apart.
      if (t.alt) expect(programOf(t).variant).toBeDefined()
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
