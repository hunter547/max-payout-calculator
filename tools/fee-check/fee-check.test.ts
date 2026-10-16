/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import {
  FIRM_CONTRACTS,
  firmContracts,
  type FeeSchedule,
  type FirmContracts,
} from '@/lib/contracts'
import {
  checkFirm,
  needsAttention,
  nextDates,
  report,
  type Fetched,
  type Outcome,
} from './compare'
import { feeTable, readPage, READERS, type Page } from './readers'

const firm = (id: string) => firmContracts(id)!
const table = (rows: string[][]) =>
  `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`

describe('reading a page', () => {
  it('takes the round trip where a firm prints both columns', () => {
    // Apex's layout, its fee table followed by a bare instrument list.
    const page = readPage(
      table([
        ['Name', 'Symbol', 'Exchange', 'Per Side', 'Round Turn'],
        ['Equity Futures'],
        ['E-mini S&P 500 (ES)', 'ES', 'CME', '1.99', '3.98'],
        ['E-Micro Euro', 'M6E', 'CME', '.42', '.84'],
        ['RBOB Gasoline', 'RB', 'NYMEX', '', ''],
      ]) +
        table([
          ['Name', 'Symbol', 'Exchange'],
          ['Heating Oil', 'HO', 'NYMEX'],
        ]),
    )
    expect(feeTable(page, firm('apex'))).toEqual({ ES: 3.98, M6E: 0.84 })
  })

  it('takes the per-side column where that is all a firm prints', () => {
    const page = readPage(
      table([
        ['Symbol', 'Name', 'Commission (Per Side)', 'Exchange'],
        ['ES', 'E-mini S&P 500 Futures', '1.75', 'CME'],
      ]),
    )
    expect(feeTable(page, firm('lucid'))).toEqual({ ES: 1.75 })
  })

  it('skips what is priced in euros or not priced at all', () => {
    // Tradeify's.
    const page = readPage(
      table([
        ['Name', 'Symbol', 'Exchange', 'Total Round Trip Cost'],
        ['E-Mini S&P 500', 'ES', 'CME', '$5.76'],
        ['Nikkei 225 (USD)', 'NKD', 'CME', 'Not listed in fee schedule'],
        ['DAX Index', 'FDAX', 'EUREX', '$5.94 (EUR)'],
      ]),
    )
    expect(feeTable(page, firm('tradeify'))).toEqual({ ES: 5.76 })
  })

  it('finds the symbol in the product name where there is no symbol column', () => {
    // Topstep's, its examples tables above with no fee column of their own.
    const page = readPage(
      table([
        ['Example using ES & MES', 'ES', 'MES'],
        ['Total', '$3.78', '$1.22'],
      ]) +
        table([
          ['Product', 'Total Round-Turn Cost (RT)'],
          ['CME Equity Futures', ''],
          ['E-mini S&P 500 (ES)', '$3.78'],
          ['Micro E-mini S&P 500 (MES)', '$1.22'],
        ]),
    )
    expect(feeTable(page, firm('topstep'))).toEqual({ ES: 3.78, MES: 1.22 })
  })

  it('reads MyFundedFutures’ restricted list, and only the list', () => {
    const url = firm('mffu').sources[0].url
    const page = readPage(
      '<p>The following products are currently restricted from trading:</p>' +
        '<p>Silver (SI)</p><p>Copper (HG)</p>' +
        '<p>As of April 17th, new limits for micro contracts (MGC):</p>',
    )
    expect(READERS[url](page, firm('mffu')).restricted).toEqual(['SI', 'HG'])
    expect(READERS[url](readPage('<p>No notice.</p>'), firm('mffu')).restricted).toEqual([])
  })

  it('reads Topstep’s products capped at zero, not the ones capped at 2/4/6', () => {
    const url = firm('topstep').sources[1].url
    const page = readPage(
      table([
        ['', 'Trading Combine, Express Funded Account', 'Live Funded Account'],
        [
          'Metals Restriction',
          '<p>Silver (SI) = 0</p><p>Micro Silver (SIL) = 2/4/6</p><p>Copper (HG) = 0</p>',
          '<p>Platinum (PL) = 0</p><p>Gold (GC) = 3/6/9</p>',
        ],
      ]),
    )
    expect(READERS[url](page, firm('topstep')).restricted).toEqual([
      'SI',
      'HG',
      'PL',
    ])
  })
})

it('has a reader for every source page, and no others', () => {
  const urls = FIRM_CONTRACTS.flatMap((f) => f.sources.map((s) => s.url))
  expect(Object.keys(READERS).sort()).toEqual([...new Set(urls)].sort())
})

/**
 * Pages that say exactly what the registry does, laid out for each reader:
 * the source's fee table, a supported-products table, and the firm's
 * restrictions both as MyFundedFutures lists them and as Topstep caps them.
 */
function pagesFor(registry: FirmContracts): Fetched[] {
  const restricted = Object.keys(registry.restricted ?? {})
  const column = registry.quoted === 'perSide' ? 'Per side' : 'Round trip'
  return registry.sources.map((source) => {
    const schedule: FeeSchedule =
      registry.schedules.find((s) => s.platform?.id === source.platform) ??
      registry.schedules[0]
    const symbols = Object.keys(schedule.fees)
    const page: Page = {
      tables: [
        [
          ['Symbol', 'Exchange', column],
          ...symbols.map((s) => [s, 'CME', String(schedule.fees[s])]),
        ],
        [['Symbol', 'Exchange'], ...symbols.map((s) => [s, 'CME'])],
        [['', 'Trading Combine'], restricted.map((s) => `Product (${s}) = 0`)],
      ],
      lines: [
        'The following products are currently restricted from trading:',
        ...restricted.map((s) => `Product (${s})`),
      ],
    }
    return { source, page }
  })
}

/** The registry for a firm with one change made to it. */
function edited(
  id: string,
  change: (fees: Record<string, number>) => void,
  restricted?: Record<string, string>,
): FirmContracts {
  const real = firm(id)
  return {
    ...real,
    schedules: real.schedules.map((s, i) => {
      const fees = { ...s.fees }
      if (i === 0) change(fees)
      return { ...s, fees }
    }),
    restricted: restricted ?? real.restricted,
  }
}

describe('checking a firm', () => {
  it('confirms every firm whose pages say what the registry does', () => {
    for (const registry of FIRM_CONTRACTS) {
      expect(checkFirm(registry, pagesFor(registry))).toEqual({ kind: 'confirmed' })
    }
  })

  it('reports a fee that moved, by platform where the firm has them', () => {
    const pages = pagesFor(firm('apex'))
    const registry = edited('apex', (fees) => (fees.MNQ = 1.0))
    expect(checkFirm(registry, pages)).toEqual({
      kind: 'changed',
      notes: ['Rithmic: MNQ went from $1.00 to $1.02.'],
    })
  })

  it('says a per-side fee is per side', () => {
    const pages = pagesFor(firm('lucid'))
    const registry = edited('lucid', (fees) => (fees.ES = 1.5))
    expect(checkFirm(registry, pages)).toEqual({
      kind: 'changed',
      notes: ['ES went from $1.50 to $1.75 a side.'],
    })
  })

  it('reports contracts added and dropped, and ones not in CONTRACTS', () => {
    const pages = pagesFor(firm('topstep'))
    pages[0].page!.tables[0].push(['QI', 'COMEX', '2.00'])
    const registry = edited('topstep', (fees) => {
      delete fees.MNQ
      fees.ZZ = 1
    })
    expect(checkFirm(registry, pages)).toEqual({
      kind: 'changed',
      notes: [
        'MNQ is now priced, at $1.22.',
        'QI is priced at $2.00 but is not in CONTRACTS; it needs CME’s tick specs first.',
        'ZZ is no longer priced.',
      ],
    })
  })

  it('offers what Tradeify both prices and supports', () => {
    const pages = pagesFor(firm('tradeify'))
    // E-mini Silver: still in the fee table, gone from the supported list.
    pages[0].page!.tables[0].push(['QI', 'COMEX', '3.40'])
    expect(checkFirm(firm('tradeify'), pages)).toEqual({ kind: 'confirmed' })

    pages[1].page!.tables = pages[1].page!.tables.map((t) =>
      t.filter((row) => row[0] !== 'ZW'),
    )
    expect(checkFirm(firm('tradeify'), pages)).toEqual({
      kind: 'changed',
      notes: ['ZW is no longer priced and supported.'],
    })
  })

  it('reports restrictions lifted and imposed', () => {
    const pages = pagesFor(firm('mffu'))
    const registry = edited('mffu', () => {}, { SI: 'Restricted', GC: 'Restricted' })
    expect(checkFirm(registry, pages)).toEqual({
      kind: 'changed',
      notes: [
        'HG is now restricted.',
        'PL is now restricted.',
        'NG is now restricted.',
        'QG is now restricted.',
        'GC is no longer restricted.',
      ],
    })
  })

  it('calls a page with no fee table on it unreadable, not unpriced', () => {
    const pages = pagesFor(firm('lucid'))
    pages[0].page!.tables = []
    expect(checkFirm(firm('lucid'), pages)).toEqual({
      kind: 'unreadable',
      notes: [
        'no fees found on Approved Products and Commissions; the page may have changed shape.',
      ],
    })
  })

  it('calls a page that would not load unreachable', () => {
    const pages = pagesFor(firm('apex'))
    pages[2] = { source: pages[2].source, error: 'HTTP 403' }
    expect(checkFirm(firm('apex'), pages)).toEqual({
      kind: 'unreachable',
      notes: ['Could not load WealthCharts Commissions & Instruments: HTTP 403.'],
    })
  })
})

describe('what comes of it', () => {
  const unreachable: Outcome = { kind: 'unreachable', notes: ['HTTP 403.'] }
  const changed: Outcome = { kind: 'changed', notes: ['ES went from $1.50 to $1.75.'] }
  const at = (checked: string) => ({ ...firm('apex'), checked })

  it('raises a change at once, and a page that would not load once stale', () => {
    expect(needsAttention(at('2026-10-14'), changed, '2026-10-15')).toBe(true)
    expect(needsAttention(at('2026-10-14'), unreachable, '2026-10-28')).toBe(false)
    expect(needsAttention(at('2026-10-14'), unreachable, '2026-10-29')).toBe(true)
    expect(needsAttention(at('2026-10-14'), { kind: 'confirmed' }, '2027-01-01')).toBe(false)
  })

  it('moves forward only the firms it confirmed', () => {
    const outcomes = new Map<FirmContracts, Outcome>([
      [firm('mffu'), { kind: 'confirmed' }],
      [firm('apex'), unreachable],
    ])
    expect(
      nextDates({ mffu: '2026-10-01', apex: '2026-10-01' }, outcomes, '2026-10-15'),
    ).toEqual({ mffu: '2026-10-15', apex: '2026-10-01' })
  })

  it('reports only what needs attention, the same way every day', () => {
    const outcomes = new Map<FirmContracts, Outcome>([
      [firm('mffu'), { kind: 'confirmed' }],
      [at('2026-10-14'), unreachable],
      [{ ...firm('lucid'), checked: '2026-10-14' }, changed],
    ])
    const body = report(outcomes, '2026-10-20')
    expect(body).toContain('### Lucid Trading: its pages have changed')
    expect(body).toContain('Last confirmed Wed, Oct 14, 2026.')
    expect(body).toContain('- ES went from $1.50 to $1.75.')
    expect(body).not.toContain('Apex')
    expect(report(outcomes, '2026-10-21')).toBe(body)

    expect(report(outcomes, '2026-10-30')).toContain(
      '### Apex Trader Funding: its pages could not be loaded',
    )
    expect(report(new Map([[firm('mffu'), { kind: 'confirmed' }]]), '2026-10-30')).toBe('')
  })
})
