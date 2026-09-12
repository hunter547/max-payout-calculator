/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { accountTemplate, firmOf, hasSchedule, sizesFor } from '@/lib/accounts'
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

/** The workbook's own account: MyFundedFutures 50k Builder. */
const WORKBOOK_RULES = {
  balance: '4758.34',
  startingBalance: '0',
  payoutThreshold: '4100',
  minimumPayout: '500',
  consistency: '50',
  minTradingDays: '2',
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

/** Skip the walkthrough: day-by-day, payout taken, the workbook's account. */
function seedDashboard() {
  seed({
    'mpc.setup': {
      templateId: 'mffu-50k-builder',
      approach: 'dayByDay',
      payoutTaken: true,
    },
    'mpc.rules': WORKBOOK_RULES,
  })
}

const headline = () => container.querySelector('h1')?.textContent ?? ''
const text = () => container.textContent ?? ''
const header = () => container.querySelector('header')?.textContent ?? ''
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

/** Past the account screens, on the workbook's account by default. */
function toApproach(templateId = 'mffu-50k-builder') {
  const template = accountTemplate(templateId)
  choose(firmOf(template).id)
  press('Continue')
  choose(template.programId)
  press('Continue')
  // A type with one size has no size screen; it came with the type.
  if (sizesFor(template.programId).length > 1) {
    choose(templateId)
    press('Continue')
  }
  // Only accounts with a graduated or dated schedule are asked about it.
  if (hasSchedule(template)) press('Continue')
}

/** Walk the point-in-time screens up to the strategy question. */
function pointInTimeTo(
  balance: string,
  largest: string,
  cumulative: string,
  tradingDays = '3',
) {
  toApproach()
  choose('pointInTime')
  press('Continue')
  type(byLabel('Current balance'), balance)
  press('Continue')
  type(byLabel('Largest profit day'), largest)
  press('Continue')
  type(byLabel('Cumulative profit'), cumulative)
  press('Continue')
  type(byLabel('Trading days so far'), tradingDays)
  press('Continue')
}

describe('walkthrough', () => {
  it('opens by asking which prop firm, in the default theme', () => {
    render()

    expect(headline()).toBe('Which prop firm?')
    expect(document.documentElement.dataset.brand).toBe('default')
    expect(text()).toContain('MyFundedFutures')
    expect(text()).toContain('Tradeify')
    // Each card carries the firm's logo and what its accounts have in common.
    const logos = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('alt'),
    )
    expect(logos).toEqual(['MyFundedFutures logo', 'Tradeify logo'])
    expect(text()).toContain('Builder accounts')
    expect(text()).toContain('2 sizes, 25k to 50k')
    expect(text()).toContain('Growth accounts')
    expect(text()).toContain('4 sizes, 25k to 150k')
    expect(text()).toContain('35% consistency rule')
  })

  it('asks for a firm before moving on', () => {
    render()
    press('Continue')

    expect(headline()).toBe('Which prop firm?')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Choose a prop firm to continue.',
    )
  })

  it('asks for the account type, then its size', () => {
    render()
    choose('tradeify')
    press('Continue')

    // The type carries the rules that hold across its sizes.
    expect(headline()).toBe('Which account type?')
    expect(text()).toContain('4 sizes: 25k, 50k, 100k, 150k')
    expect(text()).toContain('35% consistency rule')
    expect(text()).toContain('5 trading days minimum')
    expect(text()).toContain('Payouts capped by how many you have taken')
    // Tradeify offers one type, so it came with the firm.
    expect(
      container
        .querySelector('button[role="radio"][value="tradeify-growth"]')
        ?.getAttribute('data-state'),
    ).toBe('checked')

    press('Continue')

    // The size carries the money.
    expect(headline()).toBe('Which account size?')
    const offered = Array.from(
      container.querySelectorAll('button[role="radio"]'),
    ).map((b) => b.getAttribute('value'))
    expect(offered).toEqual([
      'tradeify-25k-growth',
      'tradeify-50k-growth',
      'tradeify-100k-growth',
      'tradeify-150k-growth',
    ])
    expect(text()).toContain('Balance starts at $100,000')
    expect(text()).toContain('$104,500 balance for a $2,000 first payout')
    expect(text()).toContain('$1,000 minimum payout')

    press('Continue')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Choose an account size to continue.',
    )

    choose('tradeify-100k-growth')
    press('Continue')
    // Growth graduates its payouts, so the schedule comes next.
    expect(headline()).toBe('Where are you in your payout schedule?')
  })

  it('offers the Builder sizes, whose rules are the same halved', () => {
    render()
    choose('mffu')
    press('Continue')

    expect(headline()).toBe('Which account type?')
    expect(text()).toContain('2 sizes: 25k, 50k')
    expect(text()).toContain('50% consistency rule')

    press('Continue')
    expect(headline()).toBe('Which account size?')
    expect(text()).toContain('$2,100 balance for a $1,000 first payout')
    expect(text()).toContain('$250 minimum payout')
    expect(text()).toContain('$4,100 balance for a $2,000 first payout')

    choose('mffu-25k-builder')
    press('Continue')

    // Flat caps and one schedule, so no payout schedule screen.
    expect(headline()).toBe('How do you want to track this payout?')
    expect(header()).toContain('MyFundedFutures 25k Builder')
  })

  it('asks about the approach next', () => {
    render()
    toApproach()

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
    toApproach()
    press('Continue')

    expect(headline()).toBe('How do you want to track this payout?')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Choose an approach to continue.',
    )
  })

  it('point-in-time: the workbook numbers reproduce its plan', () => {
    render()
    pointInTimeTo('4758.34', '359', '6.6')

    expect(headline()).toBe('How fast do you want to reach your payout?')
    choose('conservative')
    press('Show my plan')

    expect(headline()).toBe('Two more trading days at $355.70 each')
    expect(text()).toContain('Your numbers')
    expect(JSON.parse(window.localStorage.getItem('mpc.setup')!)).toMatchObject({
      templateId: 'mffu-50k-builder',
      approach: 'pointInTime',
      strategy: 'conservative',
    })
  })

  it('rejects a blank amount', () => {
    render()
    toApproach()
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
      container.querySelectorAll(
        '[aria-labelledby="walkthrough-curated-days-label"] button',
      ),
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
    toApproach()
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
    toApproach()
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

    // Balance = $0 start + $6.60: target 4100 - 6.6 = 4093.40 over 2 days.
    expect(headline()).toBe('Two more trading days at $2,043.40 each')
    expect(text()).toContain('Starting balance plus your logged days.')
  })

  it('moves to the firm’s theme the moment it is picked', () => {
    render()
    // The header names no account until one is chosen.
    expect(header()).not.toContain('Growth')

    choose('tradeify')
    expect(document.documentElement.dataset.brand).toBe('tradeify')

    press('Continue')
    choose('tradeify-growth')
    press('Continue')
    choose('tradeify-100k-growth')
    expect(header()).toContain('Tradeify 100k Growth')

    press('Back')
    press('Back')
    choose('mffu')
    expect(document.documentElement.dataset.brand).toBe('mffu')
    // Its one type comes with it, but Builder has two sizes, so the header
    // waits until one is picked.
    expect(header()).not.toContain('Builder')
    press('Continue')
    press('Continue')
    choose('mffu-50k-builder')
    expect(header()).toContain('MyFundedFutures 50k Builder')
  })

  it('leaves the theme as it was when the walkthrough is backed out of', () => {
    seedDashboard()
    seed({ 'mpc.brand': 'default', 'mpc.theme': 'light' })
    render()
    press('Change approach')
    choose('tradeify')
    expect(document.documentElement.dataset.brand).toBe('tradeify')

    press('Keep my current setup')

    expect(document.documentElement.dataset.brand).toBe('default')
    expect(headline()).toBe('Two more trading days at $250.00 each')
  })

  it('a Tradeify account brings its own rules and theme', () => {
    render()
    toApproach('tradeify-50k-growth')
    choose('pointInTime')
    press('Continue')

    expect(text()).toContain('It starts at $50,000.')
    type(byLabel('Current balance'), '51000')
    press('Continue')
    type(byLabel('Largest profit day'), '900')
    press('Continue')
    type(byLabel('Cumulative profit'), '1200')
    press('Continue')

    expect(headline()).toBe('How many of your days count so far?')
    expect(text()).toContain('Tradeify needs 5 trading days')
    expect(text()).toContain('only days making more than $150 count')
    type(byLabel('Trading days so far'), '2')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    expect(byLabel('Starting balance').value).toBe('50000')
    expect(byLabel('Balance for max payout').value).toBe('53000')
    expect(byLabel('Minimum payout').value).toBe('500')
    expect(byLabel('Consistency rule').value).toBe('35')
    expect(byLabel('Minimum trading days').value).toBe('5')
    expect(byLabel('Profit for a day to count').value).toBe('150')
    expect(document.documentElement.dataset.brand).toBe('tradeify')
  })

  it('asks where the trader is in a graduated payout schedule', () => {
    render()
    choose('tradeify')
    press('Continue')
    press('Continue')
    choose('tradeify-50k-growth')
    press('Continue')

    expect(headline()).toBe('Where are you in your payout schedule?')
    // The first payout, on the schedule the account is bought on today.
    expect(text()).toContain('Payout 1 can be up to $1,500')
    expect(text()).toContain('which needs a balance of $53,000')
    // The firm's own qualifying balance already leaves room to spare, so
    // the buffer asks for nothing extra and nothing warns.
    expect(text()).toContain('leaves $1,400 of drawdown room')
    expect(text()).not.toContain('of drawdown to play with')

    // The account opens on a buffer of a quarter of its $2,000 drawdown.
    expect(byLabel('Payout buffer').value).toBe('500')

    // The fourth payout caps at $3,000, which cannot land on the $50,100
    // floor, so it needs the floor plus that cap plus the buffer.
    type(byLabel('Payouts taken so far'), '3')
    expect(text()).toContain('Payout 4 can be up to $3,000')
    expect(text()).toContain('as can every one after it')
    expect(text()).toContain('which needs a balance of $53,600')
    expect(text()).toContain('leaves $500 of drawdown room')
    // The default is the same line the warning draws, so it stays quiet.
    expect(text()).not.toContain('of drawdown to play with')

    // Cut the buffer and the app says what that costs.
    type(byLabel('Payout buffer'), '100')
    expect(text()).toContain('which needs a balance of $53,200')
    expect(text()).toContain('That leaves $100 of drawdown room')
    expect(text()).toContain('started with $2,000 of drawdown')

    // Nothing at all still clears the floor rather than landing on it.
    type(byLabel('Payout buffer'), '0')
    expect(text()).toContain('which needs a balance of $53,100')
    expect(text()).toContain('That leaves $0 of drawdown room')
    type(byLabel('Payout buffer'), '500')

    // An account bought before the cutoff is on the older table.
    press('Before it')
    expect(text()).toContain('Payout 4 can be up to $2,250')
    expect(text()).toContain('which needs a balance of $52,850')

    type(byLabel('Payouts taken so far'), '0')
    expect(text()).toContain('which needs a balance of $52,100')

    press('Continue')
    choose('pointInTime')
    press('Continue')
    type(byLabel('Current balance'), '52000')
    press('Continue')
    type(byLabel('Largest profit day'), '400')
    press('Continue')
    type(byLabel('Cumulative profit'), '900')
    press('Continue')
    type(byLabel('Trading days so far'), '5')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    // The older schedule's $52,100 is what the rules were filled in with.
    expect(byLabel('Balance for max payout').value).toBe('52100')
    expect(JSON.parse(window.localStorage.getItem('mpc.setup')!)).toMatchObject({
      templateId: 'tradeify-50k-growth',
      era: 'before',
      payoutsSoFar: 0,
    })
  })

  it('skips the schedule screen for an account with one flat cap', () => {
    render()
    toApproach('tradeify-25k-growth')

    // 25k Growth pays a flat $1,000 and has no before-cutoff table.
    expect(headline()).toBe('How do you want to track this payout?')
  })

  it('skips the walkthrough for data saved before it existed', () => {
    seed({ 'mpc.days': [{ id: 'a', date: '2026-09-08', amount: '359.00' }] })
    render()

    expect(headline()).not.toBe('Which prop firm?')
    expect(ledgerRows()).toHaveLength(1)
  })

  it('reopens from the dashboard and can be backed out of', () => {
    seedDashboard()
    render()
    press('Change approach')
    expect(headline()).toBe('Which prop firm?')

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
    // A history that reproduces the workbook's saved largest day and net.
    addDay('2026-09-08', '359')
    addDay('2026-09-09', '-212.40')
    addDay('2026-09-10', '-140')

    expect(ledgerRows()).toHaveLength(3)
    expect(headline()).toBe('Two more trading days at $355.70 each')
    expect(text()).toContain('$718.00') // profit required
    expect(text()).toContain('+$6.60') // net profit
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

  it('shows the payout-ready state without dividing by zero', () => {
    render()
    addDay('2026-09-08', '400')
    addDay('2026-09-09', '400')

    // Two trading days is also the firm's minimum, so nothing is left.
    expect(headline()).toBe('Payout ready')
    expect(text()).toContain('2 of 2')
    expect(text()).not.toContain('NaN')
    expect(text()).not.toContain('Infinity')
  })

  it('stretches the plan to cover the minimum trading days', () => {
    seed({ 'mpc.rules': { ...WORKBOOK_RULES, minTradingDays: '5' } })
    render()
    addDay('2026-09-08', '900')

    // $900 still to make, but one day traded of five, so it spreads over four.
    expect(headline()).toBe('Four more trading days at $225.00 each')
    expect(text()).toContain('because MyFundedFutures needs 4 more')
    expect(text()).toContain('1 of 5')
  })

  it('locks the account settings until the lock is clicked', () => {
    render()
    const fields = [
      'Current balance',
      'Starting balance',
      'Balance for max payout',
      'Minimum payout',
      'Consistency rule',
      'Minimum trading days',
      'Profit for a day to count',
    ].map(byLabel)
    const picker = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Funded account"]',
    )!
    const restore = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Restore defaults',
    )!

    expect(picker.textContent).toContain('50k Builder')
    expect(fields.every((f) => f.disabled)).toBe(true)
    expect(picker.disabled).toBe(true)
    expect(restore.disabled).toBe(true)

    click('Unlock account settings')
    expect(fields.some((f) => f.disabled)).toBe(false)
    expect(picker.disabled).toBe(false)
    expect(restore.disabled).toBe(false)
    type(byLabel('Balance for max payout'), '5000')
    expect(byLabel('Balance for max payout').value).toBe('5000')

    click('Lock account settings')
    expect(fields.every((f) => f.disabled)).toBe(true)
  })

  it('puts the account rules back as the firm set them', () => {
    render()
    click('Unlock account settings')
    type(byLabel('Consistency rule'), '20')
    type(byLabel('Current balance'), '4200')
    press('Restore defaults')

    expect(byLabel('Consistency rule').value).toBe('50')
    // The balance is the trader's own number, not one of the firm's rules.
    expect(byLabel('Current balance').value).toBe('4200')
  })

  it('leaves logging days open while the account is locked', () => {
    render()
    addDay('2026-09-08', '359')

    expect(byLabel('Consistency rule').disabled).toBe(true)
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

    expect(text()).toContain('Starting balance plus your logged days.')
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
    expect(JSON.parse(window.localStorage.getItem('mpc.appearance')!)).toEqual({
      brand: 'mffu',
      scheme: 'dark',
    })
  })

  // Every registered theme, so a new firm is covered as soon as it's added.
  it.each(BRAND_THEMES.map((t) => [t.name, t] as const))(
    '%s applies to the whole app in its own modes',
    (_, theme) => {
      seedDashboard()
      seed({ 'mpc.theme': 'light', 'mpc.brand': theme.id })
      render()

      expect(root.dataset.brand).toBe(theme.id)
      expect(root.classList.contains('dark')).toBe(
        !theme.schemes.includes('light'),
      )
      expect(modeToggle() !== null).toBe(theme.schemes.length > 1)

      // The header names the account; the logo belongs to the firm, not the
      // theme, so it sits with the account settings whichever theme is on.
      expect(container.querySelector('header img')).toBeNull()
      expect(header()).toContain('MyFundedFutures 50k Builder')
      expect(
        container.querySelector('aside img')?.getAttribute('alt'),
      ).toBe('MyFundedFutures logo')
    },
  )

  it('is available from the first walkthrough screen', () => {
    seed({ 'mpc.brand': 'mffu' })
    render()

    expect(headline()).toBe('Which prop firm?')
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

  it('says in the footer the app is not affiliated with the firms it shows', () => {
    seedDashboard()
    render()

    const footer = container.querySelector('footer')?.textContent
    expect(footer).toContain('Your entries are saved in this browser only.')
    expect(footer).toContain(
      'Not affiliated with or endorsed by MyFundedFutures or Tradeify.',
    )
  })
})

describe('point-in-time dashboard', () => {
  function seedPointInTime(
    largest: string,
    cumulative: string,
    tradingDays = '3',
  ) {
    seed({
      'mpc.setup': {
        templateId: 'mffu-50k-builder',
        approach: 'pointInTime',
        payoutTaken: false,
        strategy: 'conservative',
      },
      'mpc.rules': WORKBOOK_RULES,
      'mpc.snapshot': {
        largestProfitDay: largest,
        netProfit: cumulative,
        tradingDays,
      },
    })
  }

  it('recalculates as the numbers change', () => {
    seedPointInTime('359', '6.6')
    render()
    expect(headline()).toBe('Two more trading days at $355.70 each')

    // Balance moved in with the locked account settings; the point-in-time
    // numbers stay editable.
    expect(byLabel('Current balance').disabled).toBe(true)
    expect(byLabel('Largest profit day').disabled).toBe(false)
    expect(byLabel('Cumulative profit').disabled).toBe(false)
    expect(byLabel('Trading days so far').disabled).toBe(false)

    type(byLabel('Cumulative profit'), '800')

    expect(headline()).toBe('Payout ready')
    expect(ledgerRows()).toHaveLength(0)
  })

  it('holds the plan open until the minimum trading days are met', () => {
    seedPointInTime('359', '800', '0')
    render()

    // The profit is there, so the plan exists only to cover the two days.
    expect(headline()).toBe('Two more trading days to qualify')
    expect(text()).toContain('0 of 2')
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

  it('a Tradeify account needs five trading days before a payout', () => {
    seed({
      'mpc.setup': {
        templateId: 'tradeify-50k-growth',
        approach: 'pointInTime',
        payoutTaken: false,
        strategy: 'conservative',
      },
      'mpc.rules': {
        balance: '60000',
        startingBalance: '50000',
        payoutThreshold: '53000',
        minimumPayout: '500',
        consistency: '35',
        minTradingDays: '5',
        qualifyingDayProfit: '150',
      },
      'mpc.snapshot': {
        largestProfitDay: '1000',
        netProfit: '5000',
        tradingDays: '2',
      },
    })
    render()

    // The profit is there, so the headline carries the bar a day has to beat
    // rather than an amount to make.
    expect(headline()).toBe('Three more trading days over $150.00')
    expect(text()).toContain('Tradeify needs 3 more trading days')
    expect(text()).toContain('a day has to beat that to be one of them')
    expect(text()).toContain('2 of 5')
  })

  it('says only qualify where the firm counts every day traded', () => {
    seedPointInTime('359', '800', '0')
    render()

    // The workbook's account has no profit bar, so there is none to name.
    expect(headline()).toBe('Two more trading days to qualify')
    expect(text()).toContain('whatever those days make')
  })
})
