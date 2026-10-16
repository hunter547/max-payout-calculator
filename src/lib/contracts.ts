/**
 * The futures a trader can take to each firm, and what each firm charges to
 * trade one. Two registries, because the two halves come from different
 * places and go stale at different rates:
 *
 * - `CONTRACTS` is the exchange's: tick size and tick value, read off CME
 *   Group's own contract specification pages. These change rarely, and when
 *   they do it is the exchange that announces it.
 * - `FIRM_CONTRACTS` is each firm's: which of those contracts it lets you
 *   trade, and its fee for one round trip, read off the firm's own help
 *   center. These change whenever the firm or the exchange reprices, and
 *   every entry says where it came from. When it was last confirmed against
 *   those pages lives in `fees-checked.json`, which the daily fee check
 *   (tools/fee-check) moves forward on its own whenever a firm's pages still
 *   match this table to the cent.
 *
 * Firms publish tick specs of their own too, but they are not the source
 * here. MyFundedFutures' table gives Natural Gas the $2.50 tick of an
 * intercommodity spread rather than the outright's $10.00, and Platinum a
 * $10.00 tick that CME prices at $5.00 — copy errors that would misprice
 * every trade on them.
 */

import CHECKED from '@/lib/fees-checked.json'
import type { ContractSpec } from '@/lib/ticks'

export type Sector =
  | 'equity'
  | 'energy'
  | 'metals'
  | 'currencies'
  | 'rates'
  | 'agriculture'
  | 'crypto'

export const SECTORS: readonly { id: Sector; name: string }[] = [
  { id: 'equity', name: 'Equity index' },
  { id: 'energy', name: 'Energy' },
  { id: 'metals', name: 'Metals' },
  { id: 'currencies', name: 'Currencies' },
  { id: 'rates', name: 'Interest rates' },
  { id: 'agriculture', name: 'Agriculture' },
  { id: 'crypto', name: 'Crypto' },
]

/**
 * How the contract's price is written, which is what a move in it reads as.
 * Grains and livestock are quoted in cents, Treasuries in 32nds of a point,
 * and everything else in plain decimals of its own unit.
 */
export type Quote = 'decimal' | 'cents' | 'thirtySeconds'

export interface Contract extends ContractSpec {
  /** CME Globex root symbol. */
  symbol: string
  name: string
  sector: Sector
  exchange: 'CME' | 'CBOT' | 'NYMEX' | 'COMEX'
  /** Tick size is in these units: cents for corn, points of par for ZN. */
  quote: Quote
}

/**
 * Every contract at least one firm offers, in the order the picker lists
 * them: each sector's most-traded first, and a micro straight after its
 * full-size contract.
 *
 * Tick sizes are the outright's. Most CME pages list finer ticks too — for
 * calendar spreads, BTIC, TAS or TACO — and a trader in an outright position
 * moves by the outright tick only.
 *
 * Sourced from cmegroup.com contract specifications, checked 2026-10-14:
 * https://www.cmegroup.com/markets/<path>.contractSpecs.html for each.
 */
export const CONTRACTS: readonly Contract[] = [
  // "0.25 index points = $12.50"
  { symbol: 'ES', name: 'E-mini S&P 500', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 0.25, tickValue: 12.5 },
  { symbol: 'MES', name: 'Micro E-mini S&P 500', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 0.25, tickValue: 1.25 },
  { symbol: 'NQ', name: 'E-mini Nasdaq-100', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 0.25, tickValue: 5 },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 0.25, tickValue: 0.5 },
  { symbol: 'YM', name: 'E-mini Dow ($5)', sector: 'equity', exchange: 'CBOT', quote: 'decimal', tickSize: 1, tickValue: 5 },
  { symbol: 'MYM', name: 'Micro E-mini Dow', sector: 'equity', exchange: 'CBOT', quote: 'decimal', tickSize: 1, tickValue: 0.5 },
  { symbol: 'RTY', name: 'E-mini Russell 2000', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 0.1, tickValue: 5 },
  { symbol: 'M2K', name: 'Micro E-mini Russell 2000', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 0.1, tickValue: 0.5 },
  { symbol: 'EMD', name: 'E-mini S&P MidCap 400', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 0.1, tickValue: 10 },
  // "5.00 per index point = $25.00": Nikkei moves five points at a time.
  { symbol: 'NKD', name: 'Nikkei 225 (USD)', sector: 'equity', exchange: 'CME', quote: 'decimal', tickSize: 5, tickValue: 25 },

  { symbol: 'CL', name: 'Crude Oil', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.01, tickValue: 10 },
  { symbol: 'MCL', name: 'Micro WTI Crude Oil', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.01, tickValue: 1 },
  // "0.025 per barrel = $12.50" — not crude's cent.
  { symbol: 'QM', name: 'E-mini Crude Oil', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.025, tickValue: 12.5 },
  // "Outright: 0.001 per MMBtu = $10.00"; the $2.50 tick above it on the
  // page is for intercommodity spreads.
  { symbol: 'NG', name: 'Henry Hub Natural Gas', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.001, tickValue: 10 },
  { symbol: 'QG', name: 'E-mini Natural Gas', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.005, tickValue: 12.5 },
  { symbol: 'MNG', name: 'Micro Henry Hub Natural Gas', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.001, tickValue: 1 },
  { symbol: 'RB', name: 'RBOB Gasoline', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.0001, tickValue: 4.2 },
  { symbol: 'HO', name: 'Heating Oil (NY Harbor ULSD)', sector: 'energy', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.0001, tickValue: 4.2 },

  { symbol: 'GC', name: 'Gold', sector: 'metals', exchange: 'COMEX', quote: 'decimal', tickSize: 0.1, tickValue: 10 },
  { symbol: 'MGC', name: 'Micro Gold', sector: 'metals', exchange: 'COMEX', quote: 'decimal', tickSize: 0.1, tickValue: 1 },
  { symbol: 'QO', name: 'E-mini Gold', sector: 'metals', exchange: 'COMEX', quote: 'decimal', tickSize: 0.25, tickValue: 12.5 },
  { symbol: 'SI', name: 'Silver', sector: 'metals', exchange: 'COMEX', quote: 'decimal', tickSize: 0.005, tickValue: 25 },
  // CME's 1,000 oz contract, which it calls Micro Silver.
  { symbol: 'SIL', name: 'Micro Silver', sector: 'metals', exchange: 'COMEX', quote: 'decimal', tickSize: 0.005, tickValue: 5 },
  { symbol: 'HG', name: 'Copper', sector: 'metals', exchange: 'COMEX', quote: 'decimal', tickSize: 0.0005, tickValue: 12.5 },
  { symbol: 'MHG', name: 'Micro Copper', sector: 'metals', exchange: 'COMEX', quote: 'decimal', tickSize: 0.0005, tickValue: 1.25 },
  // Platinum and palladium are NYMEX listings, whatever the firms' tables say.
  { symbol: 'PL', name: 'Platinum', sector: 'metals', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.1, tickValue: 5 },
  { symbol: 'PA', name: 'Palladium', sector: 'metals', exchange: 'NYMEX', quote: 'decimal', tickSize: 0.5, tickValue: 50 },

  { symbol: '6E', name: 'Euro FX', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.00005, tickValue: 6.25 },
  { symbol: 'M6E', name: 'Micro EUR/USD', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.0001, tickValue: 1.25 },
  { symbol: 'E7', name: 'E-mini Euro FX', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.0001, tickValue: 6.25 },
  { symbol: '6B', name: 'British Pound', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.0001, tickValue: 6.25 },
  { symbol: 'M6B', name: 'Micro GBP/USD', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.0001, tickValue: 0.625 },
  { symbol: '6J', name: 'Japanese Yen', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.0000005, tickValue: 6.25 },
  { symbol: '6A', name: 'Australian Dollar', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.00005, tickValue: 5 },
  { symbol: 'M6A', name: 'Micro AUD/USD', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.0001, tickValue: 1 },
  { symbol: '6C', name: 'Canadian Dollar', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.00005, tickValue: 5 },
  { symbol: '6S', name: 'Swiss Franc', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.00005, tickValue: 6.25 },
  { symbol: '6N', name: 'New Zealand Dollar', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.00005, tickValue: 5 },
  { symbol: '6M', name: 'Mexican Peso', sector: 'currencies', exchange: 'CME', quote: 'decimal', tickSize: 0.00001, tickValue: 5 },

  // "1/2 of 1/32 of one point (0.015625) = $15.625"
  { symbol: 'ZN', name: '10-Year T-Note', sector: 'rates', exchange: 'CBOT', quote: 'thirtySeconds', tickSize: 0.015625, tickValue: 15.625 },
  { symbol: 'ZB', name: '30-Year T-Bond', sector: 'rates', exchange: 'CBOT', quote: 'thirtySeconds', tickSize: 0.03125, tickValue: 31.25 },
  { symbol: 'ZF', name: '5-Year T-Note', sector: 'rates', exchange: 'CBOT', quote: 'thirtySeconds', tickSize: 0.0078125, tickValue: 7.8125 },
  // $200,000 face, so its eighth of a 32nd is worth the same as ZF's quarter.
  { symbol: 'ZT', name: '2-Year T-Note', sector: 'rates', exchange: 'CBOT', quote: 'thirtySeconds', tickSize: 0.00390625, tickValue: 7.8125 },
  { symbol: 'TN', name: 'Ultra 10-Year T-Note', sector: 'rates', exchange: 'CBOT', quote: 'thirtySeconds', tickSize: 0.015625, tickValue: 15.625 },
  { symbol: 'UB', name: 'Ultra T-Bond', sector: 'rates', exchange: 'CBOT', quote: 'thirtySeconds', tickSize: 0.03125, tickValue: 31.25 },

  // "1/4 of one cent (0.0025) per bushel = $12.50": a quarter-cent tick on a
  // price quoted in cents.
  { symbol: 'ZC', name: 'Corn', sector: 'agriculture', exchange: 'CBOT', quote: 'cents', tickSize: 0.25, tickValue: 12.5 },
  { symbol: 'ZS', name: 'Soybeans', sector: 'agriculture', exchange: 'CBOT', quote: 'cents', tickSize: 0.25, tickValue: 12.5 },
  { symbol: 'ZW', name: 'Chicago SRW Wheat', sector: 'agriculture', exchange: 'CBOT', quote: 'cents', tickSize: 0.25, tickValue: 12.5 },
  { symbol: 'ZL', name: 'Soybean Oil', sector: 'agriculture', exchange: 'CBOT', quote: 'cents', tickSize: 0.01, tickValue: 6 },
  // Meal alone of the soy complex is quoted in dollars a ton.
  { symbol: 'ZM', name: 'Soybean Meal', sector: 'agriculture', exchange: 'CBOT', quote: 'decimal', tickSize: 0.1, tickValue: 10 },
  // "0.00025 per pound = $10.00" on a price quoted in cents a pound.
  { symbol: 'HE', name: 'Lean Hogs', sector: 'agriculture', exchange: 'CME', quote: 'cents', tickSize: 0.025, tickValue: 10 },
  { symbol: 'LE', name: 'Live Cattle', sector: 'agriculture', exchange: 'CME', quote: 'cents', tickSize: 0.025, tickValue: 10 },
  { symbol: 'GF', name: 'Feeder Cattle', sector: 'agriculture', exchange: 'CME', quote: 'cents', tickSize: 0.025, tickValue: 12.5 },

  { symbol: 'MBT', name: 'Micro Bitcoin', sector: 'crypto', exchange: 'CME', quote: 'decimal', tickSize: 5, tickValue: 0.5 },
  { symbol: 'MET', name: 'Micro Ether', sector: 'crypto', exchange: 'CME', quote: 'decimal', tickSize: 0.5, tickValue: 0.05 },
]

export function contractBySymbol(symbol: string): Contract | undefined {
  return CONTRACTS.find((c) => c.symbol === symbol)
}

export interface Platform {
  id: string
  name: string
}

export interface FeeSchedule {
  /** Set where the firm prices platforms differently; one schedule otherwise. */
  platform?: Platform
  /** The fee per contract, keyed by symbol, as the firm prints it. */
  fees: Readonly<Record<string, number>>
}

export interface FeeSource {
  title: string
  url: string
  /** The date the page itself gives, where it gives one. */
  updated?: string
  /** The platform it prices, where the firm has a page for each. */
  platform?: string
}

export interface FirmContracts {
  firmId: string
  /**
   * Whether `fees` are one side of the trade or the round trip. Lucid prints
   * per side; everyone else the round trip. Kept as printed, so the table can
   * be checked against the page by eye.
   */
  quoted: 'roundTrip' | 'perSide'
  schedules: readonly FeeSchedule[]
  /** Listed and priced, but the firm has stopped them for now — and why. */
  restricted?: Readonly<Record<string, string>>
  sources: readonly FeeSource[]
  /** When the sources were last confirmed to match this table. */
  checked: string
}

export const FIRM_CONTRACTS: readonly FirmContracts[] = [
  {
    firmId: 'mffu',
    // "Total Cost Round Trip", the one fee column on the instrument list. No
    // page prices its platforms differently.
    quoted: 'roundTrip',
    schedules: [
      {
        fees: {
          ES: 4.68, MES: 1.9, NQ: 4.68, MNQ: 1.9, YM: 5.76, MYM: 1.9,
          RTY: 4.68, M2K: 1.9, NKD: 6.22,
          CL: 4.92, MCL: 1.16, QM: 4.32, NG: 5.12, QG: 2.92, RB: 6.0, HO: 4.92,
          GC: 5.12, MGC: 2.2, SI: 5.12, SIL: 2.84, HG: 5.12, PL: 4.12,
          '6E': 5.12, M6E: 1.44, '6B': 5.12, '6J': 5.12, '6A': 5.04,
          M6A: 1.44, '6C': 5.12, '6S': 5.12, '6N': 5.12,
          ZC: 6.12, ZS: 6.12, ZW: 6.12, ZL: 6.12, ZM: 6.12, HE: 6.12, LE: 6.12,
          MBT: 3.5, MET: 1.16,
        },
      },
    ],
    // "Due to increased market volatility, MFFU is implementing temporary
    // commodities trading restrictions … The following products are
    // currently restricted from trading."
    restricted: {
      SI: 'MyFundedFutures has temporarily restricted Silver for volatility.',
      HG: 'MyFundedFutures has temporarily restricted Copper for volatility.',
      PL: 'MyFundedFutures has temporarily restricted Platinum for volatility.',
      NG: 'MyFundedFutures has temporarily restricted Natural Gas for volatility.',
      QG: 'MyFundedFutures has temporarily restricted E-mini Natural Gas for volatility.',
    },
    sources: [
      {
        title: 'Futures Instrument List',
        url: 'https://help.myfundedfutures.com/en/articles/9735811-futures-instrument-list',
        updated: '2026-08-24',
      },
    ],
    checked: CHECKED.mffu,
  },
  {
    firmId: 'tradeify',
    // "Total Round Trip Cost includes Exchange fees, NFA fees, Clearing fees,
    // and Commissions … All prices PER contract." One schedule for every
    // account and platform.
    quoted: 'roundTrip',
    schedules: [
      {
        fees: {
          ES: 5.76, MES: 1.82, NQ: 5.76, MNQ: 1.82, YM: 5.76, MYM: 1.82,
          RTY: 5.76, M2K: 1.82, EMD: 5.66,
          // The commission article says $6.00; the newer Pricing Reference
          // summary says $5.66, which is EMD's fee to the cent and points
          // back to the commission article for the full table. The article
          // is the one whose job is the fees.
          CL: 6.0, MCL: 2.12, QM: 5.4, NG: 6.2, QG: 4.0,
          GC: 6.2, MGC: 2.12, QO: 5.0, SI: 6.2, HG: 6.2,
          '6E': 6.2, M6E: 1.6, '6B': 6.2, '6J': 6.2, '6A': 6.2, M6A: 1.6,
          '6C': 6.2, '6S': 10.2,
          ZC: 7.2, ZS: 15.2, ZW: 17.2, ZL: 7.2, ZM: 9.2,
          HE: 9.2, LE: 11.2, GF: 7.2,
        },
      },
    ],
    // Supported but never priced, so left out: NKD, PL, PA. The EUREX
    // products need a paid Tradovate add-on and are priced in euros. E-mini
    // Silver (QI) is still in the fee table but no longer on the supported
    // list, which "Updated today" on the day this was checked.
    sources: [
      {
        title: 'Trading Commission Fees',
        url: 'https://help.tradeify.co/en/articles/10468315-trading-commission-fees',
        updated: '2026-04-28',
      },
      {
        title: 'Rules: Supported Trading Products / Assets',
        url: 'https://help.tradeify.co/en/articles/10468222-rules-supported-trading-products-assets',
      },
    ],
    checked: CHECKED.tradeify,
  },
  {
    firmId: 'topstep',
    // "Total Round-Turn Cost (RT)": exchange fee, the $0.02 NFA fee and
    // Topstep's commission together, on TopstepX — the only platform it
    // offers. CME's October 1, 2026 rise on MCL and MNG is already in.
    quoted: 'roundTrip',
    schedules: [
      {
        fees: {
          ES: 3.78, MES: 1.22, NQ: 3.78, MNQ: 1.22, YM: 3.78, MYM: 1.22,
          RTY: 3.78, M2K: 1.22, NKD: 5.32,
          CL: 4.02, MCL: 1.72, QM: 3.42, NG: 4.22, QG: 2.02, MNG: 1.92,
          RB: 4.02, HO: 4.02,
          GC: 4.32, MGC: 1.92, SI: 4.32, SIL: 2.72, HG: 4.32, MHG: 1.92,
          PL: 4.32,
          '6E': 4.22, M6E: 1.0, E7: 2.72, '6B': 4.22, M6B: 1.0, '6J': 4.22,
          '6A': 4.22, M6A: 1.0, '6C': 4.22, '6S': 4.22, '6N': 4.22, '6M': 4.22,
          ZN: 2.62, ZB: 2.76, ZF: 2.32, ZT: 2.32, TN: 2.62, UB: 2.92,
          ZC: 5.28, ZS: 5.28, ZW: 5.28, ZL: 5.28, ZM: 5.28, HE: 5.22, LE: 5.22,
          MBT: 2.82, MET: 0.72,
        },
      },
    ],
    // Its volatility caps put these three at 0 contracts on the Trading
    // Combine, the Express Funded Account and the Live account alike.
    restricted: {
      SI: 'Topstep caps Silver at 0 contracts while its volatility limits last.',
      HG: 'Topstep caps Copper at 0 contracts while its volatility limits last.',
      PL: 'Topstep caps Platinum at 0 contracts while its volatility limits last.',
    },
    sources: [
      {
        title: 'TopstepX — Commissions and Fees',
        url: 'https://help.topstep.com/en/articles/8284213-topstepx-commissions-and-fees',
      },
      {
        title: 'Risk Adjustments: High Risk/High Volatility',
        url: 'https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility',
      },
    ],
    checked: CHECKED.topstep,
  },
  {
    firmId: 'lucid',
    // "Commission (Per Side)" — the one fee column, for every plan and
    // platform. No round-trip figure is printed.
    quoted: 'perSide',
    schedules: [
      {
        fees: {
          ES: 1.75, MES: 0.5, NQ: 1.75, MNQ: 0.5, YM: 1.75, MYM: 0.5,
          RTY: 1.75, M2K: 0.5, NKD: 1.75,
          CL: 2.0, MCL: 0.5, QM: 2.0, NG: 2.0, QG: 1.3,
          GC: 2.3, MGC: 0.8, SI: 2.3, SIL: 1.6, HG: 2.3, PL: 2.3,
          '6E': 2.4, '6B': 2.4, '6J': 2.4, '6A': 2.4, '6C': 2.4, '6S': 2.4,
          '6N': 2.4,
          ZC: 2.8, ZS: 2.8, ZW: 2.8, ZL: 2.8, ZM: 2.8, HE: 2.8, LE: 2.8,
        },
      },
    ],
    sources: [
      {
        title: 'Approved Products and Commissions',
        url: 'https://support.lucidtrading.com/en/articles/11508978-approved-products-and-commissions',
        updated: '2026-08-26',
      },
    ],
    checked: CHECKED.lucid,
  },
  {
    firmId: 'apex',
    // "commission schedule for both Evaluation and Paid/Funded Accounts",
    // one per platform; these are its "Round Turn" column. NinjaTrader has
    // none of its own, and pays whichever of Rithmic or Tradovate it is
    // connected through.
    quoted: 'roundTrip',
    schedules: [
      {
        platform: { id: 'rithmic', name: 'Rithmic' },
        fees: {
          ES: 3.98, MES: 1.02, NQ: 3.98, MNQ: 1.02, YM: 3.98, MYM: 1.02,
          RTY: 3.98, M2K: 1.02, EMD: 3.98, NKD: 3.98,
          CL: 3.96, MCL: 1.02, QM: 3.92, NG: 3.96, QG: 2.52, RB: 3.96, HO: 3.96,
          GC: 4.62, MGC: 1.52, SI: 4.62, SIL: 1.52, HG: 4.62, PL: 4.62,
          PA: 4.62,
          '6E': 4.72, M6E: 0.84, '6B': 4.72, '6J': 4.72, '6A': 4.72,
          M6A: 0.84, '6C': 4.72, '6S': 4.72, '6N': 4.72,
          ZC: 5.58, ZS: 5.58, ZW: 5.58, ZL: 5.58, ZM: 5.58,
          HE: 5.58, LE: 5.58, GF: 5.58,
          MBT: 5.52, MET: 0.92,
        },
      },
      {
        platform: { id: 'tradovate', name: 'Tradovate' },
        // RB and HO are on its instrument list with no fee beside them, so
        // they are left out rather than guessed.
        fees: {
          ES: 3.1, MES: 1.04, NQ: 3.1, MNQ: 1.04, YM: 3.1, MYM: 1.04,
          RTY: 3.1, M2K: 1.04, EMD: 3.0, NKD: 4.64,
          CL: 3.34, MCL: 1.34, QM: 2.74, NG: 3.54, QG: 1.34,
          GC: 3.54, MGC: 1.34, SI: 3.54, SIL: 1.34, HG: 3.54, PL: 3.54,
          PA: 3.54,
          '6E': 3.54, M6E: 0.82, '6B': 3.54, '6J': 3.54, '6A': 3.54,
          M6A: 0.82, '6C': 3.54, '6S': 3.54, '6N': 3.54,
          ZC: 4.54, ZS: 4.54, ZW: 4.54, ZL: 4.54, ZM: 4.54,
          HE: 4.54, LE: 4.54, GF: 4.54,
          MBT: 5.34, MET: 0.74,
        },
      },
      {
        platform: { id: 'wealthcharts', name: 'WealthCharts' },
        // No Japanese Yen in either of its tables. Micro Silver is printed
        // at the full-size contract's $3.54, five times what the other two
        // platforms charge — likely a slip, but it is the published fee.
        fees: {
          ES: 3.1, MES: 1.04, NQ: 3.1, MNQ: 1.04, YM: 3.1, MYM: 1.04,
          RTY: 3.1, M2K: 1.04, EMD: 3.0, NKD: 4.64,
          CL: 3.34, MCL: 1.34, QM: 2.74, NG: 3.54, QG: 1.34, RB: 3.34, HO: 3.34,
          GC: 3.54, MGC: 1.52, SI: 3.54, SIL: 3.54, HG: 3.54, PL: 3.54,
          PA: 3.54,
          '6E': 3.54, M6E: 0.82, '6B': 3.54, '6A': 3.54, M6A: 0.82,
          '6C': 3.54, '6S': 3.54, '6N': 3.54,
          ZC: 4.54, ZS: 4.54, ZW: 4.54, ZL: 4.54, ZM: 4.54,
          HE: 4.54, LE: 4.54, GF: 4.54,
          MBT: 5.34, MET: 0.74,
        },
      },
    ],
    sources: [
      {
        title: 'Rithmic Commissions & Instruments',
        platform: 'rithmic',
        url: 'https://apextraderfunding.com/help-center/rithmic/rithmic-commissions-instruments/',
        updated: '2026-07-22',
      },
      {
        title: 'Tradovate Commission & Instruments',
        platform: 'tradovate',
        url: 'https://apextraderfunding.com/help-center/tradovate/tradovate-commission-instruments/',
        updated: '2026-08-12',
      },
      {
        title: 'WealthCharts Commissions & Instruments',
        platform: 'wealthcharts',
        url: 'https://apextraderfunding.com/help-center/wealthcharts/wealthcharts-commissions-instruments/',
        updated: '2026-10-02',
      },
    ],
    checked: CHECKED.apex,
  },
]

/**
 * How long a firm's fees can go unconfirmed before the calculator warns.
 * The fee check runs daily, so a date this old means the check has been
 * failing on that firm — its page changed, or it would not let the check in —
 * and nobody has looked since. The calculator words it as "over two weeks
 * ago".
 */
export const STALE_AFTER_DAYS = 14

/** Whether fees confirmed on `checked` are too old to take on trust. */
export function isStale(checked: string, today: string): boolean {
  const days = (Date.parse(today) - Date.parse(checked)) / 86_400_000
  return days > STALE_AFTER_DAYS
}

export function firmContracts(firmId: string): FirmContracts | undefined {
  return FIRM_CONTRACTS.find((f) => f.firmId === firmId)
}

/** The schedule for a platform, or the firm's first when it is not one of its. */
export function feeSchedule(
  firm: FirmContracts,
  platformId?: string,
): FeeSchedule {
  return (
    firm.schedules.find((s) => s.platform?.id === platformId) ??
    firm.schedules[0]
  )
}

export interface Offered {
  contract: Contract
  /** One contract in and out again, whichever way the firm printed it. */
  roundTripFee: number
  /** Why it cannot be traded right now, where the firm has stopped it. */
  restricted?: string
}

/** What a schedule lets a trader take, in the picker's order. */
export function offered(firm: FirmContracts, schedule: FeeSchedule): Offered[] {
  const sides = firm.quoted === 'perSide' ? 2 : 1
  return CONTRACTS.flatMap((contract) => {
    const fee = schedule.fees[contract.symbol]
    if (fee === undefined) return []
    return [
      {
        contract,
        // Settled to the cent: 2 × 1.15 is 2.3 exactly, not 2.2999999999999998.
        roundTripFee: Math.round(fee * sides * 100) / 100,
        restricted: firm.restricted?.[contract.symbol],
      },
    ]
  })
}

/**
 * A move of `ticks` as the contract's price scale writes it: "2.50 points"
 * on ES, "1.50 cents" on corn, "4/32" on ZN, "0.0006" on the euro.
 */
export function formatMove(contract: Contract, ticks: number): string {
  const move = ticks * contract.tickSize
  if (contract.quote === 'thirtySeconds') {
    const thirtySeconds = Number((move * 32).toPrecision(12))
    const whole = Math.floor(thirtySeconds / 32 + 1e-9)
    const rest = Number((thirtySeconds - whole * 32).toPrecision(12))
    const fraction = `${trimmed(rest)}/32`
    if (whole === 0) return fraction
    return rest === 0
      ? `${whole} ${whole === 1 ? 'point' : 'points'}`
      : `${whole} ${whole === 1 ? 'point' : 'points'} ${fraction}`
  }
  const text = move.toFixed(decimalsOf(contract.tickSize))
  if (contract.quote === 'cents') return `${text} ${move === 1 ? 'cent' : 'cents'}`
  if (contract.sector === 'equity') {
    return `${text} ${move === 1 ? 'point' : 'points'}`
  }
  return text
}

/** Decimal places a tick size needs to be written exactly: 2 for 0.25. */
function decimalsOf(size: number): number {
  for (let places = 0; places <= 10; places++) {
    if (Math.abs(Number(size.toFixed(places)) - size) < 1e-12) return places
  }
  return 10
}

function trimmed(value: number): string {
  return String(Number(value.toFixed(4)))
}
