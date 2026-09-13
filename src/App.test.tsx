/** @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { accountTemplate, firmOf, hasSchedule, sizesFor } from '@/lib/accounts'
import type { DayEntry } from '@/lib/ledger'
import type { Account } from '@/lib/portfolio'
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

/** The accounts as saved, and the one the app has open. */
function stored(): Account[] {
  return JSON.parse(window.localStorage.getItem('mpc.accounts') ?? '[]')
}

function storedOpen() {
  const accounts = stored()
  const id = JSON.parse(window.localStorage.getItem('mpc.current') ?? '""')
  return accounts.find((a) => a.id === id) ?? accounts[0]
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

/** The text of one choice card, since the cards repeat each other's words. */
function card(value: string): string {
  const radio = container.querySelector(`button[role="radio"][value="${value}"]`)
  return radio?.closest('label')?.textContent ?? ''
}

function choose(value: string) {
  const radio = container.querySelector<HTMLButtonElement>(
    `button[role="radio"][value="${value}"]`,
  )
  if (!radio) throw new Error(`No choice "${value}"`)
  act(() => radio.click())
}

/**
 * Past the account screens, on the workbook's account by default, and with a
 * payout behind you so the balance is asked for rather than worked out.
 */
function toApproach(templateId = 'mffu-50k-builder', payouts = 1) {
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
  // Where the payouts are counted, the count answers it; where they are not,
  // it is a yes or a no.
  if (hasSchedule(template)) {
    if (payouts > 0) type(byLabel('Payouts taken so far'), String(payouts))
  } else {
    choose(payouts > 0 ? 'yes' : 'no')
  }
  press('Continue')
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
  // Asked only where the firm's minimum tops what consistency already takes.
  if (container.querySelector('#walkthrough-trading-days')) {
    type(byLabel('Trading days so far'), tradingDays)
    press('Continue')
  }
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
    expect(logos).toEqual([
      'MyFundedFutures logo',
      'Tradeify logo',
      'Topstep logo',
      'Lucid Trading logo',
      'Apex Trader Funding logo',
    ])
    // One line per account type the firm offers.
    expect(text()).toContain('Builder: 2 sizes, 25k to 50k')
    expect(text()).toContain('Growth: 4 sizes, 25k to 150k')
    expect(text()).toContain('Lightning: 4 sizes, 25k to 150k')
    expect(text()).toContain('XFA Consistency: 3 sizes, 50k to 150k')
    expect(text()).toContain('Pro: 4 sizes, 25k to 150k')
    expect(text()).toContain('Direct: 4 sizes, 25k to 150k')
    expect(text()).toContain('EOD Drawdown: 4 sizes, 25k to 150k')
    expect(text()).toContain('Intraday Drawdown: 4 sizes, 25k to 150k')
    expect(text()).toContain('Legacy: 6 sizes, 25k to 300k')
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
    // Lightning sits beside it, on its own rules.
    expect(text()).toContain('20% consistency rule, rising to 30%')
    expect(text()).toContain('No minimum trading days')

    press('Continue')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Choose an account type to continue.',
    )

    choose('tradeify-growth')
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

    // Flat caps and one schedule, so a yes or no rather than a count.
    expect(headline()).toBe('Have you taken a payout from this account yet?')
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

    const bold = Array.from(container.querySelectorAll('strong')).map(
      (el) => el.textContent,
    )
    // The day-by-day card no longer hedges: it lists a balance only where one
    // will actually be asked for.
    expect(bold).toEqual(['which resets after each payout'])

    // A payout is behind this trader, so the note about what to include
    // applies, and the balance is one of the numbers to give.
    expect(text()).toContain('Since you’ve already taken a payout')
    expect(text()).toContain('Only include values from after your last payout')
    expect(card('pointInTime')).toContain('Current balance')

    // A Builder wants two trading days, which a 50% consistency rule takes
    // anyway, so there is nothing to ask for.
    expect(card('pointInTime')).not.toContain('Trading days so far')
  })

  it('keeps the payout note for traders who have not taken one', () => {
    render()
    toApproach('mffu-50k-builder', 0)

    // Nothing to reset from, so there is nothing to warn about.
    expect(headline()).toBe('How do you want to track this payout?')
    expect(text()).not.toContain('Since you’ve already taken a payout')
    expect(text()).not.toContain('Only include values from after your last payout')
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
    expect(storedOpen().setup).toMatchObject({
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
    expect(storedOpen().setup).toMatchObject({
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
    toApproach('mffu-50k-builder', 0)
    choose('dayByDay')
    press('Continue')

    // No balance screen on this path.
    expect(headline()).toBe('Log each trading day')
    addDay('2026-09-08', '359')
    addDay('2026-09-09', '-212.40')
    addDay('2026-09-10', '-140')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    // Balance = $0 start + $6.60, and $4,100 is what it has to reach, so the
    // two days close the $4,093.40 between them.
    expect(headline()).toBe('Two more trading days at $2,046.70 each')
    expect(text()).toContain('Starting balance plus your logged days')
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
    choose('tradeify-growth')
    press('Continue')
    choose('tradeify-50k-growth')
    press('Continue')

    expect(headline()).toBe('Where are you in your payout schedule?')
    // The first payout, on the schedule the account is bought on today.
    expect(text()).toContain('Payout 1 can be up to $1,500')
    expect(text()).toContain('The balance it needs is $53,000')
    // The firm's own qualifying balance already leaves room to spare, so
    // the buffer asks for nothing extra and nothing warns.
    expect(text()).toContain('leaving $1,400 of drawdown room')
    expect(text()).not.toContain('of drawdown to play with')

    // The account opens on a buffer of a quarter of its $2,000 drawdown.
    expect(byLabel('Payout buffer').value).toBe('500')

    // The fourth payout caps at $3,000, which cannot land on the $50,100
    // floor, so it needs the floor plus that cap plus the buffer.
    type(byLabel('Payouts taken so far'), '3')
    expect(text()).toContain('Payout 4 can be up to $3,000')
    expect(text()).toContain('as can every one after it')
    expect(text()).toContain('The balance it needs is $53,600')
    expect(text()).toContain('leaving $500 of drawdown room')
    // The default is the same line the warning draws, so it stays quiet.
    expect(text()).not.toContain('of drawdown to play with')

    // Cut the buffer and the app says what that costs.
    type(byLabel('Payout buffer'), '100')
    expect(text()).toContain('The balance it needs is $53,200')
    expect(text()).toContain('That leaves $100 of drawdown room')
    expect(text()).toContain('started with $2,000 of drawdown')

    // Nothing at all still clears the floor rather than landing on it.
    type(byLabel('Payout buffer'), '0')
    expect(text()).toContain('The balance it needs is $53,100')
    expect(text()).toContain('That leaves $0 of drawdown room')
    type(byLabel('Payout buffer'), '500')

    // An account bought before the cutoff is on the older table.
    press('Before it')
    expect(text()).toContain('Payout 4 can be up to $2,250')
    expect(text()).toContain('The balance it needs is $52,850')

    type(byLabel('Payouts taken so far'), '0')
    expect(text()).toContain('The balance it needs is $52,100')

    press('Continue')
    choose('pointInTime')
    press('Continue')
    // None taken, so the balance follows from the profit rather than a field.
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
    expect(storedOpen().setup).toMatchObject({
      templateId: 'tradeify-50k-growth',
      terms: 'alt',
      payoutsSoFar: 0,
    })
  })

  it('skips the schedule screen for an account with one flat cap', () => {
    render()
    toApproach('tradeify-25k-growth')

    // 25k Growth pays a flat $1,000 and has no before-cutoff table.
    expect(headline()).toBe('How do you want to track this payout?')
  })

  it('asks about payouts once, not twice, where a schedule counts them', () => {
    render()
    toApproach('tradeify-50k-growth', 0)

    // No payouts taken, so neither card lists a balance: it follows from the
    // starting balance plus the profit since, whichever way that is given.
    expect(card('dayByDay')).toContain('Each day’s profit, positive or negative')
    expect(card('dayByDay')).not.toContain('Current balance')
    expect(card('pointInTime')).toContain('Cumulative profit')
    expect(card('pointInTime')).not.toContain('Current balance')
    // A Growth minimum of five days tops the three that 35% takes, so it is
    // still worth asking about.
    expect(card('pointInTime')).toContain('Trading days so far')

    choose('dayByDay')
    press('Continue')

    // The schedule screen already asked how many payouts are behind you, so
    // the yes-or-no screen is gone and the balance comes from the days.
    expect(headline()).toBe('Log each trading day')
    expect(text()).not.toContain('Have you taken a payout')
  })

  it('works a point-in-time balance out of the profit before any payout', () => {
    render()
    toApproach('mffu-50k-builder', 0)
    choose('pointInTime')
    press('Continue')

    // A Builder starts at zero, so the balance is the cumulative profit and
    // asking for both would be asking twice.
    expect(headline()).toBe('What’s your largest profit day?')
    type(byLabel('Largest profit day'), '359')
    press('Continue')
    type(byLabel('Cumulative profit'), '800')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    expect(text()).toContain('Starting balance plus your cumulative profit')
    expect(text()).toContain('+$800.00')
  })

  it('asks for a balance once the payout count says one was taken', () => {
    render()
    choose('tradeify')
    press('Continue')
    choose('tradeify-growth')
    press('Continue')
    choose('tradeify-50k-growth')
    press('Continue')
    type(byLabel('Payouts taken so far'), '2')
    press('Continue')

    // Two payouts in, so the balance is back on the card.
    expect(card('dayByDay')).toContain('Current balance')

    choose('dayByDay')
    press('Continue')

    // Two payouts in, the logged days no longer add up to the balance.
    expect(headline()).toBe('What’s your current balance?')
    expect(text()).not.toContain('Have you taken a payout')
  })

  it('plans a LucidDirect account to its profit goal, not to a balance', () => {
    render()
    choose('lucid')
    press('Continue')
    choose('lucid-direct')
    press('Continue')
    choose('lucid-50k-direct')
    press('Continue')

    // The schedule screen names the goal, and no balance to reach with it.
    expect(text()).toContain('It unlocks at $3,000 of profit')
    expect(text()).not.toContain('The balance it needs')
    press('Continue')

    choose('pointInTime')
    press('Continue')
    type(byLabel('Largest profit day'), '400')
    press('Continue')
    type(byLabel('Cumulative profit'), '1000')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    // $2,000 of the $3,000 goal still to make, at 20% of it a day.
    expect(headline()).toBe('Four more trading days at $500.00 each')
    expect(byLabel('Profit goal').value).toBe('3000')
    expect(byLabel('Balance for max payout').value).toBe('0')
    expect(text()).toContain('The profit this payout asks for since the last one.')
  })

  it('asks Topstep whether a Daily Loss Limit was added', () => {
    render()
    choose('topstep')
    press('Continue')
    choose('topstep-xfa-consistency')
    press('Continue')
    choose('topstep-50k-xfa-consistency')
    press('Continue')

    // Nothing moves with the payout number here, so it is not asked for.
    expect(headline()).toBe('How is this account set up?')
    expect(container.querySelector('#walkthrough-schedule-payouts')).toBeNull()
    expect(text()).toContain('Did you add a Daily Loss Limit?')

    // Half the balance has to cover the cap, so it needs twice it.
    expect(text()).toContain('A payout can be up to $3,000')
    expect(text()).toContain('never more than 50% of your balance')
    expect(text()).toContain('The balance it needs is $6,000')

    press('DLL added')
    expect(text()).toContain('A payout can be up to $6,000')
    expect(text()).toContain('The balance it needs is $12,000')

    press('Continue')
    choose('pointInTime')
    press('Continue')
    type(byLabel('Largest profit day'), '900')
    press('Continue')
    type(byLabel('Cumulative profit'), '3000')
    press('Continue')
    choose('conservative')
    press('Show my plan')

    // The rules came from the DLL schedule, and a 40% rule takes three days
    // anyway, so its three-day minimum was never asked about.
    expect(byLabel('Balance for max payout').value).toBe('12000')
    expect(byLabel('Minimum payout').value).toBe('125')
    expect(byLabel('Consistency rule').value).toBe('40')
    expect(container.querySelector('#snapshot-days')).toBeNull()
    expect(document.documentElement.dataset.brand).toBe('topstep')
    expect(storedOpen().setup).toMatchObject({
      templateId: 'topstep-50k-xfa-consistency',
      terms: 'alt',
    })
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

    // Two trading days is what 50% consistency takes anyway, so nothing is
    // left to wait for and the count is not reported.
    expect(headline()).toBe('Payout ready')
    expect(text()).not.toContain('2 of 2')
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

    expect(text()).toContain('Starting balance plus your logged days')
    expect(container.querySelector('#account-balance')).toBeNull()
  })

  it('offers to take the payout only once one is ready', () => {
    render()
    // Mid-cycle: nothing to take yet.
    addDay('2026-09-08', '100')
    expect(
      Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.trim() === 'Payout taken',
      ),
    ).toBe(false)

    type(byLabel('P&L on Sep 8'), '400')
    addDay('2026-09-09', '400')
    expect(headline()).toBe('Payout ready')
    press('Payout taken')
    expect(headline()).toBe('Congratulations on taking a payout!')
  })

  it('takes the payout off the balance and clears the cycle behind it', () => {
    render()
    addDay('2026-09-08', '400')
    addDay('2026-09-09', '400')
    press('Payout taken')

    // The most this one allows: the $2,000 cap, which the balance can spare.
    expect(byLabel('Payout amount').value).toBe('2000')
    press('Continue')

    expect(headline()).toBe('Does this look correct?')
    expect(text()).toContain('$4,758.34') // balance before
    expect(text()).toContain('−$2,000.00') // the payout
    expect(text()).toContain('$2,758.34') // balance now
    expect(text()).toContain('Your 2 logged days will be cleared')
    press('Continue')

    expect(headline()).toBe('Have you made any profit since taking the payout?')
    choose('no')
    press('Start the next cycle')

    // Back on the dashboard, counting from the new balance with nothing
    // logged: $4,100 - $2,758.34 over two days.
    expect(headline()).toBe('Two more trading days at $670.83 each')
    expect(ledgerRows()).toHaveLength(0)
    expect(byLabel('Current balance').value).toBe('2758.34')
    expect(storedOpen().setup).toMatchObject({
      payoutsSoFar: 1,
      payoutTaken: true,
    })
    expect(storedOpen().days).toEqual([])
  })

  it('turns down a payout bigger than the one allowed', () => {
    render()
    addDay('2026-09-08', '400')
    addDay('2026-09-09', '400')
    press('Payout taken')

    type(byLabel('Payout amount'), '2500')
    press('Continue')
    expect(headline()).toBe('Congratulations on taking a payout!')
    expect(text()).toContain('more than the $2,000.00 this payout allows')

    // And under the firm's minimum is no good either.
    type(byLabel('Payout amount'), '100')
    press('Continue')
    expect(text()).toContain('pays out $500.00 at the least')

    type(byLabel('Payout amount'), '1500')
    press('Continue')
    expect(headline()).toBe('Does this look correct?')
    expect(text()).toContain('$3,258.34') // 4758.34 - 1500
  })

  it('keeps the days logged since the payout', () => {
    render()
    addDay('2026-09-08', '400')
    addDay('2026-09-09', '400')
    press('Payout taken')
    press('Continue')
    press('Continue')
    choose('yes')
    press('Continue')

    expect(headline()).toBe('Log each trading day')
    addDay('2026-09-15', '250')
    press('Start the next cycle')

    // The new cycle starts from the new balance, with that one day in it.
    expect(ledgerRows()).toHaveLength(1)
    expect(text()).toContain('+$250.00')
    expect(byLabel('Current balance').value).toBe('2758.34')
  })

  it('backs out of the payout flow without changing anything', () => {
    render()
    addDay('2026-09-08', '400')
    addDay('2026-09-09', '400')
    press('Payout taken')
    press('Not yet, go back')

    expect(headline()).toBe('Payout ready')
    expect(ledgerRows()).toHaveLength(2)
    expect(byLabel('Current balance').value).toBe('4758.34')
  })

  it('shows no spreadsheet cell references or formulas', () => {
    render()
    addDay('2026-09-08', '359')

    expect(text()).not.toMatch(/\b[A-K]3\b/)
    expect(text()).not.toContain('=MAX')
  })
})

/**
 * The switcher's own menu is driven in AccountSwitcher.test.tsx; what matters
 * here is that the account it names is the one the app answers to.
 */
describe('several accounts', () => {
  const growth = {
    id: 'growth',
    nickname: '',
    setup: {
      templateId: 'tradeify-50k-growth',
      approach: 'dayByDay',
      payoutTaken: true,
      // One behind it, so its balance is the typed one rather than derived.
      payoutsSoFar: 1,
      strategy: 'conservative',
    },
    rules: {
      balance: '51420.75',
      startingBalance: '50000',
      payoutThreshold: '53000',
      profitGoal: '0',
      minimumPayout: '500',
      consistency: '35',
      minTradingDays: '5',
      qualifyingDayProfit: '150',
    },
    snapshot: { largestProfitDay: '', netProfit: '', tradingDays: '' },
    days: [] as DayEntry[],
  }
  const builder = {
    id: 'builder',
    nickname: '',
    setup: {
      templateId: 'mffu-50k-builder',
      approach: 'dayByDay',
      payoutTaken: true,
      payoutsSoFar: 0,
      strategy: 'conservative',
    },
    rules: WORKBOOK_RULES,
    snapshot: { largestProfitDay: '', netProfit: '', tradingDays: '' },
    days: [
      { id: 'a', date: '2026-09-08', amount: '400' },
      { id: 'b', date: '2026-09-09', amount: '400' },
    ] as DayEntry[],
  }

  const seedBoth = (currentId: string) =>
    seed({ 'mpc.accounts': [builder, growth], 'mpc.current': currentId })

  it('moves the one saved account into the list without losing it', () => {
    // Storage as the app wrote it before accounts had ids.
    seedDashboard()
    seed({ 'mpc.days': [{ id: 'a', date: '2026-09-08', amount: '359' }] })
    render()

    // One logged day of $359, which is the whole of its cycle.
    expect(headline()).toBe('One more trading day at $359.00')
    const accounts = stored()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].days).toHaveLength(1)
    expect(accounts[0].setup.templateId).toBe('mffu-50k-builder')
    expect(header()).toContain('MyFundedFutures 50k Builder')
    // The keys it came from are left where they were.
    expect(window.localStorage.getItem('mpc.setup')).not.toBeNull()
  })

  it('answers to whichever account is open, ledger and firm with it', () => {
    seedBoth('builder')
    render()
    expect(header()).toContain('MyFundedFutures 50k Builder')
    expect(headline()).toBe('Payout ready')
    expect(ledgerRows()).toHaveLength(2)

    act(() => root.unmount())
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    seedBoth('growth')
    render()

    expect(header()).toContain('Tradeify 50k Growth')
    expect(headline()).not.toBe('Payout ready')
    expect(ledgerRows()).toHaveLength(0)
    expect(byLabel('Current balance').value).toBe('51420.75')
  })

  it('keeps a payout to the account it was taken from', () => {
    seedBoth('builder')
    render()

    press('Payout taken')
    press('Continue')
    press('Continue')
    choose('no')
    press('Start the next cycle')

    const [after, other] = stored()
    expect(after.setup.payoutsSoFar).toBe(1)
    expect(after.days).toEqual([])
    expect(after.rules.balance).toBe('2758.34')
    // The other account is exactly as it was left.
    expect(other).toEqual(growth)
  })

  it('logs a day against the open account alone', () => {
    seedBoth('growth')
    render()
    addDay('2026-09-10', '900')

    const [untouched, open] = stored()
    expect(open.days).toHaveLength(1)
    expect(untouched.days).toHaveLength(2)
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
    // Named whether the app holds their accounts or only wears their colors.
    expect(footer).toContain(
      'Not affiliated with or endorsed by MyFundedFutures, Tradeify, Topstep, ' +
        'Lucid Trading, or Apex Trader Funding.',
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
        payoutTaken: true,
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

    type(byLabel('Cumulative profit'), '800')

    expect(headline()).toBe('Payout ready')
    expect(ledgerRows()).toHaveLength(0)
  })

  it('holds the plan open until the minimum trading days are met', () => {
    // The workbook's own two days are what 50% consistency takes anyway, so
    // this raises the rule to one that can actually bind.
    seedPointInTime('359', '800', '3')
    seed({ 'mpc.rules': { ...WORKBOOK_RULES, minTradingDays: '9' } })
    render()

    // The profit is there, so the plan exists only to cover the days.
    expect(headline()).toBe('Six more trading days to qualify')
    expect(text()).toContain('3 of 9')
    // No profit bar on this account, so those days can make anything.
    expect(text()).toContain('whatever those days make')
  })

  it('says nothing about trading days a consistency rule already takes', () => {
    seedPointInTime('359', '6.6', '')
    render()

    // Two days at 50%: covered by definition, so neither asked nor reported.
    expect(headline()).toBe('Two more trading days at $355.70 each')
    expect(container.querySelector('#snapshot-days')).toBeNull()
    // The breakdown drops its row; the rule itself stays editable above it.
    const breakdown = container.querySelector('dl')?.textContent ?? ''
    expect(breakdown).toContain('Daily cap')
    expect(breakdown).not.toContain('Trading days')
    expect(byLabel('Minimum trading days').value).toBe('2')
  })

  it('switches between conservative and aggressive plans', () => {
    seedPointInTime('500', '-1050')
    render()
    expect(headline()).toBe('Five more trading days at $410.00 each')

    press('Aggressive')

    expect(headline()).toBe('Three more trading days at $1,050.00 each')
    expect(text()).toContain('lift the profit target from $1,000.00 to $2,100.00')
    expect(storedOpen().setup.strategy).toBe(
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
        payoutsSoFar: 1,
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

})
