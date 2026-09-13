/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { AccountSwitcher } from '@/components/AccountSwitcher'
import { accountFor, accountTemplate } from '@/lib/accounts'
import type { Account } from '@/lib/portfolio'

/**
 * Driven here rather than through the app, and under happy-dom rather than
 * jsdom: a Radix menu costs seconds per open in jsdom and slows every test
 * after it, which happy-dom does not do. App.test.tsx covers what switching
 * does to the app instead.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

const account = (id: string, templateId: string, nickname = ''): Account => ({
  id,
  nickname,
  setup: {
    templateId,
    approach: 'dayByDay',
    payoutTaken: true,
    strategy: 'conservative',
  },
  rules: accountFor(accountTemplate(templateId)),
  snapshot: { largestProfitDay: '', netProfit: '', tradingDays: '' },
  days: [],
})

function mount(accounts: Account[], currentId: string) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const calls: string[] = []

  act(() =>
    root.render(
      <AccountSwitcher
        accounts={accounts}
        currentId={currentId}
        onSwitch={(id) => calls.push(`switch:${id}`)}
        onAdd={() => calls.push('add')}
        onRename={(id, nickname) => calls.push(`rename:${id}:${nickname}`)}
        onRemove={(id) => calls.push(`remove:${id}`)}
      />,
    ),
  )

  // Radix opens the menu from the keyboard and renders it in a portal.
  const open = () =>
    act(() => {
      container
        .querySelector('button[aria-label="Switch account"]')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
  const items = () =>
    Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
  const press = (label: string) => {
    const item = items().find((el) => el.textContent?.trim() === label)
    if (!item) throw new Error(`No menu item reading "${label}"`)
    act(() => item.click())
  }

  /**
   * Closing the menu before unmounting matters: an open Radix menu left behind
   * keeps working in jsdom and slows every test after it in the file.
   */
  const close = () =>
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    })
  const unmount = () => {
    close()
    act(() => root.unmount())
    container.remove()
  }

  return { container, root, calls, open, items, press, close, unmount }
}

it('names each account after the account it is, numbering any pair', () => {
  const accounts = [
    account('one', 'tradeify-50k-growth'),
    account('two', 'tradeify-150k-growth'),
    account('three', 'tradeify-50k-growth'),
    account('four', 'mffu-25k-builder', 'Main'),
  ]
  const { container, open, items, unmount } = mount(accounts, 'one')

  expect(container.textContent).toContain('Tradeify 50k Growth #1')
  open()
  expect(items().map((el) => el.textContent?.trim())).toEqual([
    'Tradeify 50k Growth #1',
    'Tradeify 150k Growth',
    'Tradeify 50k Growth #2',
    'Main',
    'Add an account',
    'Rename this one',
    'Remove this one',
  ])
  unmount()
})

it('reports which account was picked, and asks to add one', () => {
  const accounts = [
    account('one', 'mffu-50k-builder'),
    account('two', 'lucid-50k-pro'),
  ]
  const { calls, open, press, unmount } = mount(accounts, 'one')

  open()
  press('Lucid Trading 50k Pro')
  expect(calls).toEqual(['switch:two'])

  open()
  press('Add an account')
  expect(calls).toEqual(['switch:two', 'add'])
  unmount()
})

it('renames in place rather than behind a dialog', () => {
  const accounts = [account('one', 'topstep-50k-xfa-consistency')]
  const { container, calls, open, press, unmount } = mount(accounts, 'one')

  open()
  press('Rename this one')

  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="Account name"]',
  )!
  // The name it already goes by is the placeholder, so it needs no typing.
  expect(input.placeholder).toBe('Topstep 50k XFA Consistency')
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!
  act(() => {
    setter.call(input, '  Swing  ')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => input.form!.requestSubmit())

  expect(calls).toEqual(['rename:one:Swing'])
  unmount()
})

it('asks before removing, and only offers it when there is a choice', () => {
  const asked: string[] = []
  window.confirm = (message?: string) => {
    asked.push(message ?? '')
    return true
  }

  const alone = mount([account('one', 'mffu-50k-builder')], 'one')
  alone.open()
  expect(alone.items().map((el) => el.textContent?.trim())).not.toContain(
    'Remove this one',
  )
  alone.unmount()

  const pair = mount(
    [account('one', 'mffu-50k-builder'), account('two', 'lucid-50k-pro')],
    'two',
  )
  pair.open()
  pair.press('Remove this one')
  expect(asked[0]).toContain('Remove Lucid Trading 50k Pro?')
  expect(pair.calls).toEqual(['remove:two'])
  pair.unmount()
})
