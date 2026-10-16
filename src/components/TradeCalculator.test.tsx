/** @vitest-environment jsdom */
// The menus are opened in the last test only: after a Radix menu closes in
// jsdom every later test in the file crawls (see ThemePicker.test.tsx), and in
// the whole app each one costs seconds, which is why App.test.tsx leaves them
// to this file.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TradeCalculator, type Corridor } from '@/components/TradeCalculator'
import { firmContracts } from '@/lib/contracts'
import type { TradePrefs } from '@/lib/portfolio'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver

let container: HTMLDivElement
let root: Root
let saved: TradePrefs[]

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  saved = []
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** The default account's corridor: a $355.70 day under a $359 cap. */
const CORRIDOR: Corridor = { low: 355.7, high: 359 }

function show(firmId: string, prefs: TradePrefs = {}) {
  act(() =>
    root.render(
      <TradeCalculator
        open
        onOpenChange={() => {}}
        firmId={firmId}
        corridor={CORRIDOR}
        prefs={prefs}
        onPrefsChange={(patch) => saved.push(patch)}
      />,
    ),
  )
}

const text = () =>
  document.body.querySelector('[role="dialog"]')?.textContent ?? ''

function button(startsWith: string): HTMLButtonElement {
  const found = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
  ).find((b) => b.textContent?.trim().startsWith(startsWith))
  if (!found) throw new Error(`No button reading "${startsWith}"`)
  return found
}

function openMenu(labelId: string): HTMLElement[] {
  const trigger = document.body.querySelector(
    `button[aria-labelledby="${labelId}"]`,
  )!
  act(() => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  return Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  )
}

it('prices by platform where the firm does, and saves the choice', () => {
  show('apex')
  // Apex prints a schedule per platform, Rithmic first.
  expect(button('Rithmic').getAttribute('data-state')).toBe('on')
  expect(text()).toContain('1 × $3.98 round trip')

  act(() => button('Tradovate').click())
  expect(saved).toEqual([{ platform: 'tradovate' }])
  show('apex', { platform: 'tradovate' })
  expect(text()).toContain('1 × $3.10 round trip')
})

it('shows no platform choice where the firm has one schedule', () => {
  show('topstep')
  expect(() => button('Rithmic')).toThrow()
  expect(text()).toContain('1 × $3.78 round trip')
})

it('doubles a fee the firm prints per side', () => {
  show('lucid')
  // Lucid's ES is "1.75" a side.
  expect(text()).toContain('1 × $3.50 round trip')
  expect(text()).toContain('twice its published per-side fee')
})

it('falls back from a saved contract the firm has since restricted', () => {
  show('topstep', { symbol: 'SI' })
  expect(text()).not.toContain('Silver')
  expect(text()).toContain('E-mini S&P 500')
})

it('links the page the fees came from, for the platform picked', () => {
  const links = () =>
    Array.from(
      document.body.querySelectorAll<HTMLAnchorElement>('[role="dialog"] a'),
    ).map((a) => a.href)
  show('apex', { platform: 'tradovate' })
  expect(links()).toEqual([
    'https://apextraderfunding.com/help-center/tradovate/tradovate-commission-instruments/',
  ])
  // A fresh opening, since the calculator starts on the firm it is given.
  act(() => root.unmount())
  root = createRoot(container)
  show('mffu')
  expect(links()).toEqual([
    'https://help.myfundedfutures.com/en/articles/9735811-futures-instrument-list',
  ])
})

it('warns once a firm’s fees have gone two weeks unconfirmed', () => {
  // The fee check moves these dates daily, so an old one means it has been
  // failing on that firm.
  const day = (after: number) => {
    const date = new Date(`${firmContracts('topstep')!.checked}T12:00:00`)
    date.setDate(date.getDate() + after)
    return date
  }
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(day(14))
    show('topstep')
    expect(text()).toContain('Firms reprice often')
    expect(text()).not.toContain('over two weeks ago')

    act(() => root.unmount())
    root = createRoot(container)
    vi.setSystemTime(day(15))
    show('topstep')
    expect(text()).toContain('last confirmed')
    expect(text()).toContain('over two weeks ago. They may have changed since')
  } finally {
    vi.useRealTimers()
  }
})

it('lists the firm’s contracts by sector, restricted ones disabled', () => {
  show('mffu')
  const items = openMenu('calc-contract-label')

  // Each row reads symbol, name, fee: "ESE-mini S&P 500$4.68".
  expect(items.slice(0, 4).map((el) => el.textContent)).toEqual([
    'ESE-mini S&P 500$4.68',
    'MESMicro E-mini S&P 500$1.90',
    'NQE-mini Nasdaq-100$4.68',
    'MNQMicro E-mini Nasdaq-100$1.90',
  ])
  const silver = items.find((el) => el.textContent?.startsWith('SISilver'))!
  expect(silver.getAttribute('aria-disabled')).toBe('true')
  expect(silver.textContent).toContain('temporarily restricted')

  const mnq = items.find((el) => el.textContent?.startsWith('MNQ'))!
  act(() => mnq.click())
  expect(saved).toEqual([{ symbol: 'MNQ' }])

  // Another firm is a look around: its choices are not this account's.
  const firms = openMenu('calc-firm-label')
  act(() => firms.find((el) => el.textContent === 'Apex Trader Funding')!.click())
  act(() => button('WealthCharts').click())
  expect(text()).toContain('WealthCharts round trip')
  expect(saved).toEqual([{ symbol: 'MNQ' }])
})
