/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { accountFor, accountTemplate } from './accounts'
import { parseAmount } from './ledger'
import {
  accountName,
  currentAccount,
  loadAccounts,
  newAccount,
  nextCurrent,
  type Account,
} from './portfolio'
import type { Setup } from './setup'

const setup = (templateId: string): Setup => ({
  templateId,
  approach: 'dayByDay',
  payoutTaken: true,
  strategy: 'conservative',
})

const account = (templateId: string, nickname = ''): Account => ({
  ...newAccount(setup(templateId), nickname),
})

describe('loadAccounts', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts empty on a first visit', () => {
    expect(loadAccounts()).toEqual([])
  })

  it('carries the one account the app used to keep across', () => {
    const rules = accountFor(accountTemplate('tradeify-50k-growth'))
    window.localStorage.setItem(
      'mpc.setup',
      JSON.stringify(setup('tradeify-50k-growth')),
    )
    window.localStorage.setItem('mpc.rules', JSON.stringify(rules))
    window.localStorage.setItem(
      'mpc.days',
      JSON.stringify([{ id: 'a', date: '2026-09-08', amount: '359' }]),
    )

    const accounts = loadAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({
      nickname: '',
      setup: { templateId: 'tradeify-50k-growth' },
      days: [{ id: 'a', date: '2026-09-08', amount: '359' }],
      balanceBasis: 'cycleStart',
    })
    // The balance was saved as of the day it was typed, with that $359 day
    // already inside it; on the way across it becomes where the cycle began,
    // so the ledger can carry it from there without counting the day twice.
    expect(accounts[0].rules).toEqual({
      ...rules,
      balance: String(parseAmount(rules.balance) - 359),
    })
    expect(accounts[0].id).not.toBe('')
  })

  it('leaves a balance alone where the ledger never carried it', () => {
    // Point-in-time states today's balance outright, and an account with no
    // payout behind it counts up from the firm's own starting balance.
    for (const patch of [
      { approach: 'pointInTime' as const, payoutTaken: true },
      { approach: 'dayByDay' as const, payoutTaken: false },
    ]) {
      const rules = accountFor(accountTemplate('tradeify-50k-growth'))
      window.localStorage.setItem('mpc.accounts', JSON.stringify([
        { ...account('tradeify-50k-growth'), rules,
          setup: { ...setup('tradeify-50k-growth'), ...patch },
          days: [{ id: 'a', date: '2026-09-08', amount: '359' }] },
      ]))
      const [carried] = loadAccounts()
      expect(carried.rules.balance).toBe(rules.balance)
      expect(carried.balanceBasis).toBe('cycleStart')
    }
  })

  it('carries days logged before the walkthrough existed across too', () => {
    window.localStorage.setItem(
      'mpc.days',
      JSON.stringify([{ id: 'a', date: '2026-09-08', amount: '359' }]),
    )
    const accounts = loadAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].setup.templateId).toBe('mffu-50k-builder')
    expect(accounts[0].days).toHaveLength(1)
  })

  it('leaves saved accounts alone once there are any', () => {
    const saved = [account('mffu-25k-builder', 'Main')]
    window.localStorage.setItem('mpc.accounts', JSON.stringify(saved))
    window.localStorage.setItem('mpc.setup', JSON.stringify(setup('lucid-50k-pro')))
    expect(loadAccounts()).toEqual(saved)
  })
})

describe('accountName', () => {
  it('calls an account what it is until there are two of them', () => {
    const one = account('tradeify-50k-growth')
    const two = account('tradeify-150k-growth')
    expect(accountName(one, [one, two])).toBe('Tradeify 50k Growth')

    // A second of the same account numbers both, so neither needs naming.
    const three = account('tradeify-50k-growth')
    const all = [one, two, three]
    expect(accountName(one, all)).toBe('Tradeify 50k Growth #1')
    expect(accountName(three, all)).toBe('Tradeify 50k Growth #2')
    expect(accountName(two, all)).toBe('Tradeify 150k Growth')
  })

  it('uses the name the trader gave it, and stops numbering it', () => {
    const named = account('tradeify-50k-growth', '  Swing  ')
    const other = account('tradeify-50k-growth')
    expect(accountName(named, [named, other])).toBe('Swing')
    // The remaining one is alone under its own name again.
    expect(accountName(other, [named, other])).toBe('Tradeify 50k Growth')
  })
})

describe('currentAccount and nextCurrent', () => {
  const a = account('mffu-50k-builder')
  const b = account('tradeify-50k-growth')
  const c = account('lucid-50k-pro')

  it('falls back to the first account for an id that is gone', () => {
    expect(currentAccount([a, b], b.id)).toBe(b)
    expect(currentAccount([a, b], 'no-such-account')).toBe(a)
    expect(currentAccount([], a.id)).toBeUndefined()
  })

  it('moves to the one that takes its place when an account is removed', () => {
    expect(nextCurrent([a, b, c], b.id)).toBe(c.id)
    // The last one hands over to the one before it.
    expect(nextCurrent([a, b, c], c.id)).toBe(b.id)
    expect(nextCurrent([a], a.id)).toBe('')
  })
})
