/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function render() {
  act(() => root.render(<App />))
}

const headline = () => container.querySelector('h1')?.textContent ?? ''
const text = () => container.textContent ?? ''
const ledgerRows = () => container.querySelectorAll('tbody tr')

function type(input: HTMLInputElement, value: string) {
  // React overrides the value setter on the DOM node, so go through the
  // prototype descriptor for the change event to carry the new value.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function byLabel(label: string): HTMLInputElement {
  const aria = container.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  )
  if (aria) return aria
  const el = Array.from(container.querySelectorAll('label')).find(
    (l) => l.textContent === label,
  )
  if (!el) throw new Error(`No input labelled "${label}"`)
  return document.getElementById(el.htmlFor) as HTMLInputElement
}

function addDay(date: string, amount: string) {
  type(byLabel('Date'), date)
  type(byLabel('P&L'), amount)
  act(() => byLabel('P&L').form!.requestSubmit())
}

function click(label: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )
  if (!button) throw new Error(`No button labelled "${label}"`)
  act(() => button.click())
}

describe('App', () => {
  it('starts with an empty ledger and a plan from the account settings', () => {
    render()

    // No days: required = the $500 floor, cap = $250, so 2 days at $250.
    expect(headline()).toBe('Two more trading days at $250.00 each')
    expect(text()).toContain('No trading days yet')
    expect(ledgerRows()).toHaveLength(0)
  })

  it('derives largest day and net profit from daily entries', () => {
    render()
    // A history that reproduces the workbook's saved D3=359 and F3=6.6.
    addDay('2026-09-08', '359')
    addDay('2026-09-09', '-212.40')
    addDay('2026-09-10', '-140')

    expect(ledgerRows()).toHaveLength(3)
    expect(headline()).toBe('Two more trading days at $355.70 each')
    expect(text()).toContain('$718.00') // profit required (H3)
    expect(text()).toContain('+$6.60') // net profit (F3)
    // The tooltip trigger replaces the badge's data-slot, so match on text.
    const badges = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === 'Largest day',
    )
    expect(badges).toHaveLength(1)
    // Dates live in input values, not text, so find the row by its input.
    const row = badges[0].closest('tr')
    expect(row?.querySelector('input[aria-label="P&L on Sep 8"]')).not.toBeNull()
  })

  it('recalculates when a logged day is edited', () => {
    render()
    addDay('2026-09-08', '359')

    type(byLabel('P&L on Sep 8'), '900')

    // Largest 900 at 50% -> $1,800 required; 900 banked; one day at $900.
    expect(text()).toContain('$1,800.00')
    expect(headline()).toBe('One more trading day at $900.00')
  })

  it('removes a day', () => {
    render()
    addDay('2026-09-08', '100')
    addDay('2026-09-09', '50')

    click('Remove Sep 8')

    expect(ledgerRows()).toHaveLength(1)
    expect(text()).toContain('+$50.00')
  })

  it('rejects an amount that is not a number', () => {
    render()
    addDay('2026-09-08', 'abc')

    expect(ledgerRows()).toHaveLength(0)
    expect(text()).toContain('Enter the day’s profit or loss')
  })

  it('shows the target-met state without dividing by zero', () => {
    render()
    addDay('2026-09-08', '400')
    addDay('2026-09-09', '400')

    expect(headline()).toBe('Payout target reached')
    expect(text()).not.toContain('NaN')
    expect(text()).not.toContain('Infinity')
  })

  it('flags a zero consistency rule instead of showing #DIV/0!', () => {
    render()
    type(byLabel('Consistency rule'), '0')

    expect(headline()).toBe('Set a consistency rule above 0%')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(text()).not.toContain('NaN')
    expect(text()).not.toContain('Infinity')
  })

  it('shows no spreadsheet cell references or formulas', () => {
    render()
    addDay('2026-09-08', '359')

    expect(text()).not.toMatch(/\b[A-K]3\b/)
    expect(text()).not.toContain('=MAX')
  })
})
