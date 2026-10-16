import { describe, expect, it } from 'vitest'
import { FIRMS } from './accounts'
import CHECKED from './fees-checked.json'
import {
  CONTRACTS,
  FIRM_CONTRACTS,
  contractBySymbol,
  feeSchedule,
  firmContracts,
  formatMove,
  offered,
} from './contracts'

/**
 * Each firm's fee table as its page printed it on 2026-10-14, extracted from
 * the page text by script rather than retyped, so a slip in the registry
 * shows up here instead of being copied into both. Only USD exchanges.
 */
const PUBLISHED: Record<string, Record<string, number>> = {
  // Futures Instrument List, "Total Cost Round Trip"
  mffu: {"6A":5.04,"6B":5.12,"6C":5.12,"NQ":4.68,"RTY":4.68,"ES":4.68,"6E":5.12,"6J":5.12,"HE":6.12,"LE":6.12,"M6A":1.44,"MBT":3.5,"MNQ":1.9,"M2K":1.9,"MES":1.9,"M6E":1.44,"MET":1.16,"6N":5.12,"NKD":6.22,"6S":5.12,"HG":5.12,"GC":5.12,"MGC":2.2,"PL":4.12,"SI":5.12,"SIL":2.84,"ZC":6.12,"YM":5.76,"MYM":1.9,"ZS":6.12,"ZM":6.12,"ZL":6.12,"ZW":6.12,"CL":4.92,"QM":4.32,"HO":4.92,"MCL":1.16,"NG":5.12,"RB":6,"QG":2.92},
  // Trading Commission Fees, "Total Round Trip Cost"
  tradeify: {"YM":5.76,"ES":5.76,"NQ":5.76,"RTY":5.76,"EMD":5.66,"6A":6.2,"6B":6.2,"6J":6.2,"6C":6.2,"6S":10.2,"6E":6.2,"HE":9.2,"LE":11.2,"GF":7.2,"ZS":15.2,"ZL":7.2,"ZC":7.2,"ZW":17.2,"ZM":9.2,"CL":6,"NG":6.2,"QM":5.4,"QG":4,"GC":6.2,"HG":6.2,"SI":6.2,"QI":5,"QO":5,"MYM":1.82,"MES":1.82,"MNQ":1.82,"M2K":1.82,"MGC":2.12,"MCL":2.12,"M6A":1.6,"M6E":1.6},
  // TopstepX — Commissions and Fees, "Total Round-Turn Cost (RT)"
  topstep: {"ES":3.78,"MES":1.22,"NQ":3.78,"MNQ":1.22,"RTY":3.78,"M2K":1.22,"NKD":5.32,"MBT":2.82,"MET":0.72,"CL":4.02,"MCL":1.72,"QM":3.42,"PL":4.32,"QG":2.02,"RB":4.02,"HO":4.02,"NG":4.22,"MNG":1.92,"YM":3.78,"MYM":1.22,"6A":4.22,"M6A":1,"6B":4.22,"6C":4.22,"6E":4.22,"M6E":1,"6J":4.22,"6S":4.22,"E7":2.72,"6M":4.22,"6N":4.22,"M6B":1,"ZT":2.32,"ZF":2.32,"ZN":2.62,"ZB":2.76,"UB":2.92,"TN":2.62,"GC":4.32,"MGC":1.92,"SI":4.32,"SIL":2.72,"HG":4.32,"MHG":1.92,"HE":5.22,"LE":5.22,"ZC":5.28,"ZW":5.28,"ZS":5.28,"ZM":5.28,"ZL":5.28},
  // Approved Products and Commissions, "Commission (Per Side)"
  lucid: {"ES":1.75,"MES":0.5,"NQ":1.75,"MNQ":0.5,"RTY":1.75,"M2K":0.5,"NKD":1.75,"YM":1.75,"MYM":0.5,"6A":2.4,"6B":2.4,"6C":2.4,"6E":2.4,"6J":2.4,"6S":2.4,"6N":2.4,"CL":2,"MCL":0.5,"QM":2,"QG":1.3,"NG":2,"PL":2.3,"HG":2.3,"GC":2.3,"MGC":0.8,"SI":2.3,"HE":2.8,"LE":2.8,"ZS":2.8,"ZC":2.8,"ZL":2.8,"ZM":2.8,"ZW":2.8,"SIL":1.6},
  // The three Commissions & Instruments pages, "Round Turn"
  'apex/rithmic': {"ES":3.98,"NKD":3.98,"NQ":3.98,"YM":3.98,"EMD":3.98,"RTY":3.98,"6A":4.72,"6B":4.72,"6C":4.72,"6E":4.72,"6J":4.72,"6S":4.72,"6N":4.72,"HE":5.58,"LE":5.58,"GF":5.58,"ZC":5.58,"ZW":5.58,"ZS":5.58,"ZM":5.58,"ZL":5.58,"CL":3.96,"QM":3.92,"MCL":1.02,"NG":3.96,"QG":2.52,"HO":3.96,"RB":3.96,"GC":4.62,"SI":4.62,"HG":4.62,"PL":4.62,"PA":4.62,"MES":1.02,"MYM":1.02,"MNQ":1.02,"M2K":1.02,"SIL":1.52,"MGC":1.52,"M6A":0.84,"M6E":0.84,"MBT":5.52,"MET":0.92},
  'apex/tradovate': {"YM":3.1,"ES":3.1,"NQ":3.1,"RTY":3.1,"EMD":3,"NKD":4.64,"6A":3.54,"6B":3.54,"6J":3.54,"6C":3.54,"6S":3.54,"6E":3.54,"6N":3.54,"HE":4.54,"LE":4.54,"GF":4.54,"ZS":4.54,"ZL":4.54,"ZC":4.54,"ZW":4.54,"ZM":4.54,"CL":3.34,"NG":3.54,"QM":2.74,"QG":1.34,"GC":3.54,"SI":3.54,"HG":3.54,"PL":3.54,"PA":3.54,"MYM":1.04,"MES":1.04,"MNQ":1.04,"M2K":1.04,"SIL":1.34,"MGC":1.34,"MCL":1.34,"M6A":0.82,"M6E":0.82,"MBT":5.34,"MET":0.74},
  'apex/wealthcharts': {"YM":3.1,"ES":3.1,"NQ":3.1,"RTY":3.1,"EMD":3,"NKD":4.64,"6A":3.54,"6B":3.54,"6C":3.54,"6S":3.54,"6E":3.54,"6N":3.54,"HE":4.54,"LE":4.54,"GF":4.54,"ZS":4.54,"ZL":4.54,"ZC":4.54,"ZW":4.54,"ZM":4.54,"RB":3.34,"CL":3.34,"NG":3.54,"QM":2.74,"QG":1.34,"HO":3.34,"GC":3.54,"HG":3.54,"SI":3.54,"PL":3.54,"PA":3.54,"MYM":1.04,"MES":1.04,"MNQ":1.04,"M2K":1.04,"SIL":3.54,"MGC":1.52,"MCL":1.34,"M6A":0.82,"M6E":0.82,"MBT":5.34,"MET":0.74},
}

/**
 * Printed in a firm's table but deliberately not offered, each with its
 * reason in contracts.ts. Anything else missing is a mistake.
 */
const LEFT_OUT: Record<string, string[]> = {
  // In the fee table, gone from the newer supported-products list.
  tradeify: ['QI'],
}

/**
 * The outright tick of every contract as CME prints it, "<tick> = $<value>",
 * in the units the price is quoted in.
 */
const CME_TICKS: Record<string, [number, number]> = {
  ES: [0.25, 12.5], MES: [0.25, 1.25], NQ: [0.25, 5], MNQ: [0.25, 0.5],
  YM: [1, 5], MYM: [1, 0.5], RTY: [0.1, 5], M2K: [0.1, 0.5],
  EMD: [0.1, 10], NKD: [5, 25],
  CL: [0.01, 10], MCL: [0.01, 1], QM: [0.025, 12.5], NG: [0.001, 10],
  QG: [0.005, 12.5], MNG: [0.001, 1], RB: [0.0001, 4.2], HO: [0.0001, 4.2],
  GC: [0.1, 10], MGC: [0.1, 1], QO: [0.25, 12.5], SI: [0.005, 25],
  SIL: [0.005, 5], HG: [0.0005, 12.5], MHG: [0.0005, 1.25], PL: [0.1, 5],
  PA: [0.5, 50],
  '6E': [0.00005, 6.25], M6E: [0.0001, 1.25], E7: [0.0001, 6.25],
  '6B': [0.0001, 6.25], M6B: [0.0001, 0.625], '6J': [0.0000005, 6.25],
  '6A': [0.00005, 5], M6A: [0.0001, 1], '6C': [0.00005, 5],
  '6S': [0.00005, 6.25], '6N': [0.00005, 5], '6M': [0.00001, 5],
  ZN: [0.015625, 15.625], ZB: [0.03125, 31.25], ZF: [0.0078125, 7.8125],
  ZT: [0.00390625, 7.8125], TN: [0.015625, 15.625], UB: [0.03125, 31.25],
  // Quoted in cents: "1/4 of one cent (0.0025) per bushel = $12.50".
  ZC: [0.25, 12.5], ZS: [0.25, 12.5], ZW: [0.25, 12.5], ZL: [0.01, 6],
  ZM: [0.1, 10], HE: [0.025, 10], LE: [0.025, 10], GF: [0.025, 12.5],
  MBT: [5, 0.5], MET: [0.5, 0.05],
}

function registryTable(key: string): Record<string, number> {
  const [firmId, platformId] = key.split('/')
  const firm = firmContracts(firmId)!
  return { ...feeSchedule(firm, platformId).fees }
}

describe('fee tables', () => {
  it.each(Object.keys(PUBLISHED))('%s matches the firm’s published table', (key) => {
    const published = { ...PUBLISHED[key] }
    for (const symbol of LEFT_OUT[key.split('/')[0]] ?? []) delete published[symbol]
    expect(registryTable(key)).toEqual(published)
  })

  it('has every firm the app carries, and every platform of theirs', () => {
    expect(FIRM_CONTRACTS.map((f) => f.firmId).sort()).toEqual(
      FIRMS.map((f) => f.id).sort(),
    )
    const keyed = Object.keys(PUBLISHED)
    for (const firm of FIRM_CONTRACTS) {
      for (const schedule of firm.schedules) {
        const key = schedule.platform
          ? `${firm.firmId}/${schedule.platform.id}`
          : firm.firmId
        expect(keyed).toContain(key)
      }
    }
  })

  it('only prices contracts it has the specs for', () => {
    for (const firm of FIRM_CONTRACTS) {
      for (const schedule of firm.schedules) {
        for (const symbol of Object.keys(schedule.fees)) {
          expect(contractBySymbol(symbol), `${firm.firmId} ${symbol}`).toBeDefined()
        }
      }
      for (const symbol of Object.keys(firm.restricted ?? {})) {
        expect(firm.schedules.some((s) => symbol in s.fees)).toBe(true)
      }
    }
  })

  it('carries no contract that no firm offers', () => {
    const priced = new Set(
      FIRM_CONTRACTS.flatMap((f) => f.schedules.flatMap((s) => Object.keys(s.fees))),
    )
    expect(CONTRACTS.filter((c) => !priced.has(c.symbol))).toEqual([])
  })

  it('names its sources and when they were checked', () => {
    for (const firm of FIRM_CONTRACTS) {
      expect(firm.sources.length).toBeGreaterThan(0)
      for (const source of firm.sources) expect(source.url).toMatch(/^https:\/\//)
      expect(firm.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('dates every firm in the file the fee check moves forward, and no others', () => {
    // The check writes to it daily; a firm missing from it would never be
    // dated, and one left in it after the firm went would be dated forever.
    expect(Object.keys(CHECKED).sort()).toEqual(
      FIRM_CONTRACTS.map((f) => f.firmId).sort(),
    )
  })
})

describe('contract specs', () => {
  it('match CME’s outright ticks', () => {
    const registry = Object.fromEntries(
      CONTRACTS.map((c) => [c.symbol, [c.tickSize, c.tickValue]]),
    )
    expect(registry).toEqual(CME_TICKS)
  })

  it('lists each symbol once', () => {
    const symbols = CONTRACTS.map((c) => c.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })
})

describe('offered', () => {
  it('doubles a fee printed per side into the round trip', () => {
    const lucid = firmContracts('lucid')!
    const es = offered(lucid, feeSchedule(lucid)).find((o) => o.contract.symbol === 'ES')
    // "1.75" a side.
    expect(es?.roundTripFee).toBe(3.5)
  })

  it('takes a round-trip fee as printed', () => {
    const topstep = firmContracts('topstep')!
    const es = offered(topstep, feeSchedule(topstep)).find((o) => o.contract.symbol === 'ES')
    expect(es?.roundTripFee).toBe(3.78)
  })

  it('prices by platform where the firm does', () => {
    const apex = firmContracts('apex')!
    const fee = (platform: string) =>
      offered(apex, feeSchedule(apex, platform)).find((o) => o.contract.symbol === 'ES')
        ?.roundTripFee
    expect(fee('rithmic')).toBe(3.98)
    expect(fee('tradovate')).toBe(3.1)
    expect(fee('wealthcharts')).toBe(3.1)
    // An unknown platform falls back to the firm's first.
    expect(fee('ninjatrader')).toBe(3.98)
  })

  it('leaves out what a platform does not price', () => {
    const apex = firmContracts('apex')!
    const symbols = (platform: string) =>
      offered(apex, feeSchedule(apex, platform)).map((o) => o.contract.symbol)
    expect(symbols('tradovate')).not.toContain('RB')
    expect(symbols('wealthcharts')).not.toContain('6J')
    expect(symbols('rithmic')).toContain('6J')
  })

  it('marks a restricted product but still lists it', () => {
    const topstep = firmContracts('topstep')!
    const list = offered(topstep, feeSchedule(topstep))
    expect(list.find((o) => o.contract.symbol === 'SI')?.restricted).toMatch(/0 contracts/)
    expect(list.find((o) => o.contract.symbol === 'GC')?.restricted).toBeUndefined()
  })

  it('keeps the registry’s order', () => {
    const topstep = firmContracts('topstep')!
    const symbols = offered(topstep, feeSchedule(topstep)).map((o) => o.contract.symbol)
    expect(symbols.slice(0, 4)).toEqual(['ES', 'MES', 'NQ', 'MNQ'])
  })
})

describe('formatMove', () => {
  const contract = (symbol: string) => contractBySymbol(symbol)!

  it('writes index moves in points', () => {
    expect(formatMove(contract('ES'), 10)).toBe('2.50 points')
    expect(formatMove(contract('YM'), 1)).toBe('1 point')
    expect(formatMove(contract('NKD'), 3)).toBe('15 points')
  })

  it('writes grains and livestock in cents', () => {
    expect(formatMove(contract('ZC'), 6)).toBe('1.50 cents')
    expect(formatMove(contract('ZC'), 4)).toBe('1.00 cent')
    expect(formatMove(contract('HE'), 3)).toBe('0.075 cents')
  })

  it('writes Treasuries in 32nds', () => {
    expect(formatMove(contract('ZN'), 8)).toBe('4/32')
    expect(formatMove(contract('ZN'), 9)).toBe('4.5/32')
    expect(formatMove(contract('ZB'), 32)).toBe('1 point')
    expect(formatMove(contract('ZB'), 36)).toBe('1 point 4/32')
    expect(formatMove(contract('ZT'), 3)).toBe('0.375/32')
  })

  it('writes everything else as the price itself moves', () => {
    expect(formatMove(contract('CL'), 25)).toBe('0.25')
    expect(formatMove(contract('6E'), 12)).toBe('0.00060')
    expect(formatMove(contract('6J'), 3)).toBe('0.0000015')
    expect(formatMove(contract('ZM'), 5)).toBe('0.5')
  })
})
