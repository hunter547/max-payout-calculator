/**
 * The trader's accounts. Each one holds everything that used to be the whole
 * app's state — which account it is, its rules, and what has been traded since
 * its last payout — so they sit side by side without touching each other.
 *
 * Nothing here decides anything: the maths still sees one account at a time.
 */

import {
  accountFor,
  accountTemplate,
  templateLabel,
  type AccountKey,
} from '@/lib/accounts'
import { newId, parseAmount, summarize, type DayEntry } from '@/lib/ledger'
import { legacySetup, type Setup, type Snapshot } from '@/lib/setup'

export interface Account {
  id: string
  /** The trader's own name for it. Empty means "call it what it is". */
  nickname: string
  setup: Setup
  rules: Record<AccountKey, string>
  snapshot: Snapshot
  days: DayEntry[]
  /**
   * What `rules.balance` means on a day-by-day account that has taken a
   * payout. It used to be the balance as of the moment it was typed, which
   * went stale the next time a day was logged; now it is where the cycle
   * began, and the ledger carries it from there. Absent on anything saved
   * before that changed, which `loadAccounts` converts once.
   */
  balanceBasis?: 'cycleStart'
}

export const SNAPSHOT_DEFAULTS: Snapshot = {
  largestProfitDay: '',
  netProfit: '',
  tradingDays: '',
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

/** A fresh account on a template, with nothing traded on it yet. */
export function newAccount(setup: Setup, nickname = ''): Account {
  return {
    id: newId(),
    nickname,
    setup,
    rules: accountFor(accountTemplate(setup.templateId)),
    snapshot: SNAPSHOT_DEFAULTS,
    days: [],
    balanceBasis: 'cycleStart',
  }
}

/**
 * The accounts as stored, or the single account the app used to keep, moved
 * across on first load. Storage written before accounts had ids keeps its
 * ledger, its rules and its place; there is only ever one of it.
 */
/**
 * A balance saved as "as of now" becomes the balance the cycle started from,
 * by taking the logged days back off it. Only day-by-day accounts that have
 * taken a payout ever stored it the other way.
 */
function onCycleStart(account: Account): Account {
  if (account.balanceBasis === 'cycleStart') return account
  const { approach, payoutTaken } = account.setup
  if (approach !== 'dayByDay' || !payoutTaken) {
    return { ...account, balanceBasis: 'cycleStart' }
  }
  const since = summarize(account.days).netProfit
  const balance = parseAmount(account.rules.balance) - since
  return {
    ...account,
    rules: { ...account.rules, balance: String(Math.round(balance * 100) / 100) },
    balanceBasis: 'cycleStart',
  }
}

export function loadAccounts(): Account[] {
  const stored = read<Account[]>('mpc.accounts')
  if (Array.isArray(stored) && stored.length > 0) return stored.map(onCycleStart)

  const setup = read<Setup>('mpc.setup') ?? legacySetup()
  if (!setup) return []

  return [
    {
      id: newId(),
      nickname: '',
      setup,
      rules:
        read<Record<AccountKey, string>>('mpc.rules') ??
        accountFor(accountTemplate(setup.templateId)),
      snapshot: { ...SNAPSHOT_DEFAULTS, ...read<Snapshot>('mpc.snapshot') },
      days: read<DayEntry[]>('mpc.days') ?? [],
    },
  ].map(onCycleStart)
}

/**
 * What to call an account: the name the trader gave it, or the account it is.
 * Two of the same account are numbered, so nobody has to name anything to tell
 * them apart.
 */
export function accountName(account: Account, all: Account[]): string {
  const own = account.nickname.trim()
  if (own) return own

  const label = templateLabel(accountTemplate(account.setup.templateId))
  const sameName = all.filter(
    (a) =>
      !a.nickname.trim() &&
      templateLabel(accountTemplate(a.setup.templateId)) === label,
  )
  if (sameName.length < 2) return label
  return `${label} #${sameName.findIndex((a) => a.id === account.id) + 1}`
}

/** The account in play, falling back to the first one there is. */
export function currentAccount(
  accounts: Account[],
  id: string,
): Account | undefined {
  return accounts.find((a) => a.id === id) ?? accounts[0]
}

/** The id to fall back to once an account is gone. */
export function nextCurrent(accounts: Account[], removedId: string): string {
  const index = accounts.findIndex((a) => a.id === removedId)
  const left = accounts.filter((a) => a.id !== removedId)
  return (left[index] ?? left[left.length - 1])?.id ?? ''
}
