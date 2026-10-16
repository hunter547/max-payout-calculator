/**
 * Reads every firm's fee pages against the registry. Firms whose pages still
 * match have their date in src/lib/fees-checked.json moved forward to today;
 * anything else is printed, and written out for the workflow to raise as an
 * issue.
 *
 *   npm run check-fees                      plain HTTP, as the workflow runs it
 *   npm run check-fees -- --browser         in a visible Edge (or Chrome)
 *   npm run check-fees -- --report <file>   write the issue body, if any
 *   npm run check-fees -- --message <file>  write a commit message, if any
 *
 * Tradeify and Apex sit behind Cloudflare, which turns away plain requests
 * and headless browsers alike; --browser is a person's own browser on their
 * own machine, where any challenge is theirs to clear. The check does not
 * dress itself up as anything else to get past one.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { firm as firmOf } from '@/lib/accounts'
import { FIRM_CONTRACTS, type FirmContracts } from '@/lib/contracts'
import { todayISO } from '@/lib/ledger'
import {
  checkFirm,
  needsAttention,
  nextDates,
  report,
  type Fetched,
  type Outcome,
} from './compare'
import { readPage } from './readers'

const DATES = new URL('../../src/lib/fees-checked.json', import.meta.url)
const USER_AGENT =
  'max-payout-calculator fee check (+https://github.com/hunter547/max-payout-calculator)'
const CHALLENGE = /just a moment|attention required/i

const args = process.argv.slice(2)
const option = (name: string) => {
  const at = args.indexOf(name)
  return at >= 0 ? args[at + 1] : undefined
}

type Load = (url: string) => Promise<string>

async function plainLoad(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    signal: AbortSignal.timeout(60_000),
  })
  const html = await response.text()
  if (!response.ok) {
    const walled =
      response.headers.get('server') === 'cloudflare' &&
      CHALLENGE.test(html.match(/<title>([^<]*)/)?.[1] ?? '')
    throw new Error(
      `HTTP ${response.status}${walled ? ', turned away by Cloudflare' : ''}`,
    )
  }
  return html
}

async function browserLoad(): Promise<{ load: Load; close: () => Promise<void> }> {
  const { chromium } = await import('playwright-core')
  const browser = await chromium
    .launch({ channel: 'msedge', headless: false })
    .catch(() => chromium.launch({ channel: 'chrome', headless: false }))
  const tab = await browser.newPage()
  const load: Load = async (url) => {
    await tab.goto(url, { waitUntil: 'load', timeout: 60_000 })
    // A challenge page swaps itself for the real one once it is cleared.
    for (let waited = 0; CHALLENGE.test(await tab.title()); waited += 1000) {
      if (waited === 0) console.log(`  Waiting on a challenge at ${url}…`)
      if (waited >= 90_000) throw new Error('stuck on a Cloudflare challenge')
      await tab.waitForTimeout(1000)
    }
    return tab.content()
  }
  return { load, close: () => browser.close() }
}

async function fetchFirm(firm: FirmContracts, load: Load): Promise<Fetched[]> {
  const fetched: Fetched[] = []
  for (const source of firm.sources) {
    try {
      fetched.push({ source, page: readPage(await load(source.url)) })
    } catch (error) {
      fetched.push({ source, error: (error as Error).message })
    }
  }
  return fetched
}

const today = todayISO()
const browser = args.includes('--browser') ? await browserLoad() : undefined
const load = browser?.load ?? plainLoad
const outcomes = new Map<FirmContracts, Outcome>()
try {
  for (const firm of FIRM_CONTRACTS) {
    const outcome = checkFirm(firm, await fetchFirm(firm, load))
    outcomes.set(firm, outcome)
    const name = firmOf(firm.firmId).name
    console.log(
      outcome.kind === 'confirmed'
        ? `✓ ${name}: confirmed`
        : `✗ ${name}: ${outcome.kind}`,
    )
    if (outcome.kind !== 'confirmed') {
      for (const note of outcome.notes) console.log(`    ${note}`)
    }
  }
} finally {
  await browser?.close()
}

const dates = JSON.parse(readFileSync(DATES, 'utf8')) as Record<string, string>
const next = nextDates(dates, outcomes, today)
const moved = FIRM_CONTRACTS.filter((f) => next[f.firmId] !== dates[f.firmId])
if (moved.length > 0) {
  writeFileSync(DATES, `${JSON.stringify(next, null, 2)}\n`)
  const names = moved.map((f) => firmOf(f.firmId).name)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const message = `Confirm the fees of ${list} against their own pages, ${today}.`
  console.log(`\nMoved forward to ${today}: ${names.join(', ')}.`)
  const file = option('--message')
  if (file) writeFileSync(file, `${message}\n`)
}

const body = report(outcomes, today)
const file = option('--report')
if (file && body) writeFileSync(file, `${body}\n`)

const unconfirmed = FIRM_CONTRACTS.filter((f) => outcomes.get(f)!.kind !== 'confirmed')
const names = (firms: FirmContracts[]) =>
  firms.map((f) => firmOf(f.firmId).name).join(', ')
const raised = unconfirmed.filter((f) => needsAttention(f, outcomes.get(f)!, today))
const waiting = unconfirmed.filter((f) => !raised.includes(f))
if (raised.length > 0) console.log(`\nNeeds a person: ${names(raised)}.`)
if (waiting.length > 0) {
  console.log(`\nNot raised, as their dates are not stale yet: ${names(waiting)}.`)
}
