/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BRAND_THEMES } from '@/lib/themes'
import App from './App'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// Radix measures switches and radios with ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver

const WORKBOOK_ACCOUNT = {
  balance: '4758.34',
  payoutBuffer: '2100',
  payoutCap: '2000',
  consistency: '50',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.localStorage.clear()
  // Themes write to <html>, which outlives each test's container.
  delete document.documentElement.dataset.brand
  document.documentElement.classList.remove('dark')
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

function seed(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

/** Skip the walkthrough: day-by-day, payout taken, the workbook's balance. */
function seedDashboard() {
  seed({
    'mpc.setup': { approach: 'dayByDay', payoutTaken: true },
    'mpc.account': WORKBOOK_ACCOUNT,
  })
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

function press(buttonText: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === buttonText,
  )
  if (!button) throw new Error(`No button reading "${buttonText}"`)
  act(() => button.click())
}

function choose(value: string) {
  const radio = container.querySelector<HTMLButtonElement>(
    `button[role="radio"][value="${value}"]`,
  )
  if (!radio) throw new Error(`No choice "${value}"`)
  act(() => radio.click())
}

/** Walk the point-in-time screens up to the strategy question. */
function pointInTimeTo(balance: string, largest: string, cumulative: string) {
  choose('pointInTime')
  press('Continue')
  type(byLabel('Current balance'), balance)
  press('Continue')
  type(byLabel('Largest profit day'), largest)
  press('Continue')
  type(byLabel('Cumulative profit'), cumulative)
  press('Continue')
}

describe('walkthrough', () => {
  it('opens with the approach question on a first visit', () => {
    render()

    expect(headline()).toBe('How do you want to track this payout?')
    expect(text()).toContain('Point-in-time')
    expect(text()).toContain('Cumulative profit, which resets after each payout')
    expect(text()).toContain('Day-by-day')
    expect(text()).toContain('Each day’s profit, positive or negative')
    expect(text()).toContain('only if you’ve already taken a payout')

    const bold = Array.from(container.querySelectorAll('strong')).map(
      (el) => el.textContent,
    )
    expect(bold).toEqual([
      'which resets after each payout',
      'only if you’ve already taken a payout',
    ])

    expect(text()).toContain('Already taken a payout?')
    expect(text()).toContain('Only include values from after your last payout')
  })

  it('asks for a choice before moving on', () => {
    render()
    press('Continue')

    expect(headline()).toBe('How do you want to track this payout?')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Choose an approach to continue.',
    )
  })

  it('point-in-time: three numbers reproduce the workbook', () => {
    render()
    pointInTimeTo('4758.34', '359', '6.6')

    expect(headline()).toBe('How fast do you want to reach your payout?')
    choose('conservative')
    press('Show my plan')

    expect(headline()).toBe('Two more trading days at $355.70 each')
    expect(text()).toContain('Your numbers')
    expect(JSON.parse(window.localStorage.getItem('mpc.setup')!)).toMatchObject({
      approach: 'pointInTime',
      strategy: 'conservative',
    })
  })

  it('rejects a blank amount', () => {
    render()
    choose('pointInTime')
    press('Continue')
    press('Continue')

    expect(headline()).toBe('What’s your current balance?')
    expect(text()).toContain('Enter your balance as a dollar amount')
  })

  it('asks for a strategy before showing the plan', () => {
    render()
    pointInTimeTo('4758.34', '359', '6.6')
    press('Show my plan')

    expect(headline()).toBe('How fast do you want to reach your payout?')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Choose conservative, aggressive, or curated to continue.',
    )
  })

  it('previews both strategies, and aggressive takes the fewest days', () => {
    render()
    pointInTimeTo('4758.34', '500', '-1050')

    // Conservative stays under the $500 cap; aggressive goes past it.
    expect(text()).toContain('Your plan: 5 days at $410.00')
    expect(text()).toContain('Your plan: 3 days at $1,050.00')

    choose('aggressive')
    press('Show my plan')

    expect(headline()).toBe('Three more trading days at $1,050.00 each')
    expect(text()).toContain('$2,100.00') // the lifted profit target
  })

  it('says when both strategies come out the same', () => {
    render()
    pointInTimeTo('4758.34', '359', '6.6')

    expect(text()).toContain('conservative and aggressive come out the same')
  })

  it('curated by days: offers the fastest count up to nine', () => {
    render()
    pointInTimeTo('4758.34', '500', '-1050')
    choose('curated')

    // A plan is required before finishing.
    press('Show my plan')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Pick how many trading days you want.',
    )

    // Aggressive needs 3 days here, so 3 is the lowest offered.
    const offered = Array.from(
      container.querySelectorAll('[aria-labelledby="walkthrough-curated-days-label"] button'),
    ).map((b) => b.textContent)
    expect(offered).toEqual(['3', '4', '5', '6', '7', '8', '9'])

    press('4')
    expect(text()).toContain('That’s 4 days at $525.00 each.')
    press('Show my plan')

    expect(headline()).toBe('Four more trading days at $525.00 each')
    expect(JSON.parse(window.localStorage.getItem('mpc.setup')!)).toMatchObject({
      strategy: 'curated',
      curated: { mode: 'days', days: 4 },
    })
  })

  it('curated by cap: the cap sets the number of days', () => {
    render()
    pointInTimeTo('4758.34', '500', '-1050')
    choose('curated')
    press('Daily cap')
    type(byLabel('Daily cap'), '700')

    expect(text()).toContain('That’s 4 days at $525.00 each.')
    press('Show my plan')

    expect(headline()).toBe('Four more trading days at $525.00 each')
    expect(text()).toContain('Each day stays at or under your $700.00 cap.')
  })

  it('curated by cap: turns away a cap that would take over a year', () => {
    render()
    pointInTimeTo('4758.34', '500', '-1050')
    choose('curated')
    press('Daily cap')
    type(byLabel('Daily cap'), '1')
    press('Show my plan')

    expect(headline()).toBe('How fast do you want to reach your payout?')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'That cap would take more than 252 trading days. Raise it.',
    )
  })

  it('day-by-day after a payout: balance, then days', () => {
    render()
    choose('dayByDay')
    press('Continue')
    choose('yes')
    press('Continue')
    type(byLabel('Current balance'), '4758.34')
    press('Continue')

    expect(headline()).toBe('Log each trading day')
    addDay('2026-09-08', '359')
    addDay('2026-09-09', '-212.40')
    addDay('2026-09-10', '-140')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    expect(headline()).toBe('Two more trading days at $355.70 each')
    expect(ledgerRows()).toHaveLength(3)
  })

  it('day-by-day before any payout works the balance out from logged days', () => {
    render()
    choose('dayByDay')
    press('Continue')
    choose('no')
    press('Continue')

    // No balance screen on this path.
    expect(headline()).toBe('Log each trading day')
    addDay('2026-09-08', '359')
    addDay('2026-09-09', '-212.40')
    addDay('2026-09-10', '-140')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    // Balance = +$6.60: E3 = 4100 - 6.6 = 4093.40, I3 = 4086.80, J3 = 2.
    expect(headline()).toBe('Two more trading days at $2,043.40 each')
    expect(text()).toContain('Sum of your logged days.')
  })

  it('skips the walkthrough for data saved before it existed', () => {
    seed({ 'mpc.days': [{ id: 'a', date: '2026-09-08', amount: '359.00' }] })
    render()

    expect(headline()).not.toBe('How do you want to track this payout?')
    expect(ledgerRows()).toHaveLength(1)
  })

  it('reopens from the dashboard and can be backed out of', () => {
    seedDashboard()
    render()
    press('Change approach')
    expect(headline()).toBe('How do you want to track this payout?')

    press('Keep my current setup')
    expect(headline()).toBe('Two more trading days at $250.00 each')
  })
})

describe('day-by-day dashboard', () => {
  beforeEach(seedDashboard)

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

  it('locks the account settings until the lock is clicked', () => {
    render()
    const fields = [
      'Current balance',
      'Payout buffer',
      'Payout cap',
      'Consistency rule',
    ].map(byLabel)
    const restore = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Restore defaults',
    )!

    expect(fields.every((f) => f.disabled)).toBe(true)
    expect(restore.disabled).toBe(true)

    click('Unlock account settings')
    expect(fields.some((f) => f.disabled)).toBe(false)
    expect(restore.disabled).toBe(false)
    type(byLabel('Payout cap'), '1500')
    expect(byLabel('Payout cap').value).toBe('1500')

    click('Lock account settings')
    expect(fields.every((f) => f.disabled)).toBe(true)
  })

  it('leaves logging days open while the account is locked', () => {
    render()
    addDay('2026-09-08', '359')

    expect(byLabel('Payout cap').disabled).toBe(true)
    expect(byLabel('P&L on Sep 8').disabled).toBe(false)
    expect(ledgerRows()).toHaveLength(1)
  })

  it('flags a zero consistency rule instead of showing #DIV/0!', () => {
    render()
    click('Unlock account settings')
    type(byLabel('Consistency rule'), '0')

    expect(headline()).toBe('Set a consistency rule above 0%')
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(text()).not.toContain('NaN')
    expect(text()).not.toContain('Infinity')
  })

  it('switches to a derived balance when the payout toggle is turned off', () => {
    render()
    addDay('2026-09-08', '359')

    const toggle = container.querySelector<HTMLButtonElement>('#payout-taken')!
    act(() => toggle.click())

    expect(text()).toContain('Sum of your logged days.')
    expect(container.querySelector('#account-balance')).toBeNull()
  })

  it('shows no spreadsheet cell references or formulas', () => {
    render()
    addDay('2026-09-08', '359')

    expect(text()).not.toMatch(/\b[A-K]3\b/)
    expect(text()).not.toContain('=MAX')
  })
})

// Picking from the menu is tested in ThemePicker.test.tsx; see why there.
describe('color themes', () => {
  const root = document.documentElement
  const modeToggle = () =>
    container.querySelector('button[aria-label^="Switch to"]')

  it('starts on the default theme with a light/dark toggle', () => {
    seedDashboard()
    seed({ 'mpc.theme': 'light' })
    render()

    expect(root.dataset.brand).toBe('default')
    expect(root.classList.contains('dark')).toBe(false)
    expect(modeToggle()).not.toBeNull()
  })

  it('applies MyFundedFutures globally and dark only', () => {
    seedDashboard()
    seed({ 'mpc.theme': 'light', 'mpc.brand': 'mffu' })
    render()

    expect(root.dataset.brand).toBe('mffu')
    expect(root.classList.contains('dark')).toBe(true)
    expect(modeToggle()).toBeNull()
    // The light preference is kept for when a two-mode theme comes back.
    expect(JSON.parse(window.localStorage.getItem('mpc.theme')!)).toBe('light')
    // What index.html applies before first paint on the next visit.
    expect(
      JSON.parse(window.localStorage.getItem('mpc.appearance')!),
    ).toEqual({ brand: 'mffu', scheme: 'dark' })
  })

  // Every registered theme, so a new firm is covered as soon as it's added.
  it.each(BRAND_THEMES.map((t) => [t.name, t] as const))(
    '%s applies to the whole app in its own modes',
    (_, theme) => {
      seedDashboard()
      seed({ 'mpc.theme': 'light', 'mpc.brand': theme.id })
      render()

      expect(root.dataset.brand).toBe(theme.id)
      expect(root.classList.contains('dark')).toBe(!theme.schemes.includes('light'))
      expect(modeToggle() !== null).toBe(theme.schemes.length > 1)
    },
  )

  it('is available from the first walkthrough screen', () => {
    seed({ 'mpc.brand': 'mffu' })
    render()

    expect(headline()).toBe('How do you want to track this payout?')
    expect(root.dataset.brand).toBe('mffu')
    expect(
      container.querySelector('button[aria-label="Color theme"]'),
    ).not.toBeNull()
  })

  it('falls back to the default for a theme that no longer exists', () => {
    seedDashboard()
    seed({ 'mpc.brand': 'retired-firm' })
    render()

    expect(root.dataset.brand).toBe('default')
  })
})

describe('point-in-time dashboard', () => {
  function seedPointInTime(largest: string, cumulative: string) {
    seed({
      'mpc.setup': {
        approach: 'pointInTime',
        payoutTaken: false,
        strategy: 'conservative',
      },
      'mpc.account': WORKBOOK_ACCOUNT,
      'mpc.snapshot': { largestProfitDay: largest, netProfit: cumulative },
    })
  }

  it('recalculates as the three numbers change', () => {
    seedPointInTime('359', '6.6')
    render()
    expect(headline()).toBe('Two more trading days at $355.70 each')

    // Balance moved in with the locked account settings; the other two
    // point-in-time numbers stay editable.
    expect(byLabel('Current balance').disabled).toBe(true)
    expect(byLabel('Largest profit day').disabled).toBe(false)
    expect(byLabel('Cumulative profit').disabled).toBe(false)

    type(byLabel('Cumulative profit'), '800')

    expect(headline()).toBe('Payout target reached')
    expect(ledgerRows()).toHaveLength(0)
  })

  it('switches between conservative and aggressive plans', () => {
    seedPointInTime('500', '-1050')
    render()
    expect(headline()).toBe('Five more trading days at $410.00 each')

    press('Aggressive')

    expect(headline()).toBe('Three more trading days at $1,050.00 each')
    expect(text()).toContain('lift the profit target from $1,000.00 to $2,100.00')
    expect(JSON.parse(window.localStorage.getItem('mpc.setup')!).strategy).toBe(
      'aggressive',
    )

    press('Conservative')
    expect(headline()).toBe('Five more trading days at $410.00 each')
  })

  it('curated on the dashboard: pick days or set a cap', () => {
    seedPointInTime('500', '-1050')
    render()

    // Switching to curated starts from the conservative day count.
    press('Curated')
    expect(headline()).toBe('Five more trading days at $410.00 each')

    press('9')
    expect(headline()).toBe('Nine more trading days at $227.78 each')

    press('Daily cap')
    expect(headline()).toBe('Set your curated plan')

    type(byLabel('Daily cap'), '700')
    expect(headline()).toBe('Four more trading days at $525.00 each')
    expect(text()).toContain('Each day stays at or under your $700.00 cap.')
  })
})
