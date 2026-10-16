/**
 * What the fee check reads off each page in `FIRM_CONTRACTS[*].sources`.
 *
 * Every firm prints its fees as an HTML table with a header row, so one
 * reader driven by the headers covers them all: find the symbol column (or
 * the "(ES)" at the end of a product name, where there is none), the fee
 * column the firm's `quoted` says to use, and the exchange column where a
 * firm mixes in EUREX products priced in euros. Restrictions are prose or
 * one-off tables, so those readers are per firm.
 */
import { JSDOM } from 'jsdom'
import type { FirmContracts } from '@/lib/contracts'

/** A page boiled down to its tables (rows of cell text) and lines of text. */
export interface Page {
  tables: string[][][]
  lines: string[]
}

export interface Reading {
  /** Fee per contract by symbol, as printed: per side where the firm is. */
  fees?: Record<string, number>
  /** Symbols the page says cannot be traded right now. */
  restricted?: string[]
  /** Symbols the page says the firm supports, where that is its own page. */
  supported?: string[]
}

export type Reader = (page: Page, firm: FirmContracts) => Reading

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

export function readPage(html: string): Page {
  const { document } = new JSDOM(html).window
  const tables = Array.from(document.querySelectorAll('table'), (table) =>
    Array.from(table.querySelectorAll('tr'), (row) =>
      Array.from(row.querySelectorAll('th, td'), (cell) =>
        clean(cell.textContent ?? ''),
      ),
    ),
  )
  // A line per leaf block, so a list item or a paragraph is one line each.
  const lines: string[] = []
  const walk = (el: Element) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'svg'].includes(el.tagName)) {
      return
    }
    if (el.children.length === 0) {
      const text = clean(el.textContent ?? '')
      if (text) lines.push(text)
      return
    }
    const own = clean(
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' '),
    )
    if (own) lines.push(own)
    Array.from(el.children).forEach(walk)
  }
  walk(document.body)
  return { tables, lines }
}

/** The exchanges that price in dollars; Tradeify's EUREX rows are in euros. */
const DOLLAR_EXCHANGES = /^(CME|CBOT|NYMEX|COMEX)$/
const SYMBOL = /^[A-Z0-9]{1,5}$/
/** "$5.04", "3.1", ".84" — and not "Not listed in fee schedule" or "(EUR)". */
const PRICE = /^\$?(\d*\.?\d+)$/

/** Every fee in every table whose header has a fee column of the right kind. */
export function feeTable(page: Page, firm: FirmContracts): Record<string, number> {
  const column = firm.quoted === 'perSide' ? /per side/ : /round[- ](trip|turn)/
  const fees: Record<string, number> = {}
  for (const [header = [], ...rows] of page.tables) {
    const heads = header.map((h) => h.toLowerCase())
    const fee = heads.findIndex((h) => column.test(h))
    if (fee < 0) continue
    const symbol = heads.findIndex((h) => h === 'symbol' || h === 'code')
    const exchange = heads.indexOf('exchange')
    for (const row of rows) {
      const sym =
        symbol >= 0 ? row[symbol] : row[0]?.match(/\(([A-Z0-9]{1,5})\)$/)?.[1]
      if (!sym || !SYMBOL.test(sym)) continue
      if (exchange >= 0 && !DOLLAR_EXCHANGES.test(row[exchange] ?? '')) continue
      const price = row[fee]?.match(PRICE)
      if (price) fees[sym] = Number(price[1])
    }
  }
  return fees
}

/** Every dollar-exchange symbol in a table with Symbol and Exchange columns. */
function supportedTable(page: Page): string[] {
  const symbols = new Set<string>()
  for (const [header = [], ...rows] of page.tables) {
    const heads = header.map((h) => h.toLowerCase())
    const symbol = heads.indexOf('symbol')
    const exchange = heads.indexOf('exchange')
    if (symbol < 0 || exchange < 0) continue
    for (const row of rows) {
      const sym = row[symbol]
      if (sym && SYMBOL.test(sym) && DOLLAR_EXCHANGES.test(row[exchange] ?? '')) {
        symbols.add(sym)
      }
    }
  }
  return [...symbols]
}

/**
 * MyFundedFutures: "The following products are currently restricted from
 * trading:", then a line per product, "Silver (SI)". No notice, no
 * restrictions.
 */
function listedAsRestricted(page: Page): string[] {
  const start = page.lines.findIndex((l) =>
    /currently restricted from trading/i.test(l),
  )
  if (start < 0) return []
  const symbols: string[] = []
  for (const line of page.lines.slice(start + 1)) {
    const sym = line.match(/^[^()]+\(([A-Z0-9]{1,5})\)$/)?.[1]
    if (!sym) break
    symbols.push(sym)
  }
  return symbols
}

/**
 * Topstep: the "Current Restrictions" table caps each product per account
 * size, "Gold (GC) = 3/6/9", and a product it has stopped reads "Silver (SI)
 * = 0". Cells run their lines together, so "= 0" is followed by the next
 * product's name rather than a digit or a slash.
 */
function cappedAtZero(page: Page): string[] {
  const symbols = new Set<string>()
  for (const table of page.tables) {
    if (!table[0]?.some((h) => /trading combine/i.test(h))) continue
    for (const cell of table.flat()) {
      for (const [, sym] of cell.matchAll(/\(([A-Z0-9]{1,5})\) = 0(?![\d/])/g)) {
        symbols.add(sym)
      }
    }
  }
  return [...symbols]
}

const fees: Reader = (page, firm) => ({ fees: feeTable(page, firm) })

/** By source URL. Every source in `FIRM_CONTRACTS` needs one. */
export const READERS: Record<string, Reader> = {
  'https://help.myfundedfutures.com/en/articles/9735811-futures-instrument-list':
    (page, firm) => ({
      fees: feeTable(page, firm),
      restricted: listedAsRestricted(page),
    }),
  'https://help.tradeify.co/en/articles/10468315-trading-commission-fees': fees,
  // The fee table outlives the supported list: E-mini Silver (QI) is still
  // priced but no longer supported, so what Tradeify offers is the two
  // pages' overlap.
  'https://help.tradeify.co/en/articles/10468222-rules-supported-trading-products-assets':
    (page) => ({ supported: supportedTable(page) }),
  'https://help.topstep.com/en/articles/8284213-topstepx-commissions-and-fees':
    fees,
  'https://help.topstep.com/en/articles/13613539-risk-adjustments-high-risk-high-volatility':
    (page) => ({ restricted: cappedAtZero(page) }),
  'https://support.lucidtrading.com/en/articles/11508978-approved-products-and-commissions':
    fees,
  'https://apextraderfunding.com/help-center/rithmic/rithmic-commissions-instruments/':
    fees,
  'https://apextraderfunding.com/help-center/tradovate/tradovate-commission-instruments/':
    fees,
  'https://apextraderfunding.com/help-center/wealthcharts/wealthcharts-commissions-instruments/':
    fees,
}
