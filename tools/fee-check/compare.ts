/**
 * Holds what the firms' pages say against `FIRM_CONTRACTS`, and decides what
 * comes of it: a firm whose every page still matches to the cent has its date
 * in `fees-checked.json` moved forward, and anything else is reported.
 *
 * Nothing here edits the fees themselves. A changed fee goes to a person,
 * who checks it on the page the way the add-prop-firm skill says to: some
 * changes want judgment (Tradeify's CL is $6.00 on its fee page and $5.66 on
 * its pricing summary), and a wrong number here sends someone's account into
 * a breach.
 */
import { firm as firmOf } from '@/lib/accounts'
import {
  contractBySymbol,
  isStale,
  type FeeSchedule,
  type FeeSource,
  type FirmContracts,
} from '@/lib/contracts'
import { formatLongDate } from '@/lib/format'
import { READERS, type Page, type Reading } from './readers'

/** One source page, as the fetch left it: read, or the reason it was not. */
export interface Fetched {
  source: FeeSource
  page?: Page
  error?: string
}

export type Outcome =
  /** Every page read, and every fee, contract and restriction matches. */
  | { kind: 'confirmed' }
  /** The pages read, and say something the registry does not. */
  | { kind: 'changed'; notes: string[] }
  /** A page loaded but did not read as expected: likely a redesign. */
  | { kind: 'unreadable'; notes: string[] }
  /** A page did not load: a network error, an outage, or a bot wall. */
  | { kind: 'unreachable'; notes: string[] }

const money = (fee: number) => `$${fee.toFixed(2)}`

export function checkFirm(firm: FirmContracts, fetched: Fetched[]): Outcome {
  const failed = fetched.filter((f) => f.error !== undefined)
  if (failed.length > 0) {
    return {
      kind: 'unreachable',
      notes: failed.map((f) => `Could not load ${f.source.title}: ${f.error}.`),
    }
  }

  const readings = new Map<FeeSource, Reading>()
  const unreadable: string[] = []
  for (const { source, page } of fetched) {
    const read = READERS[source.url]
    if (!read) unreadable.push(`No reader for ${source.title} (${source.url}).`)
    else readings.set(source, read(page!, firm))
  }

  const supported = merged(readings, (r) => r.supported)
  const notes: string[] = []
  for (const schedule of firm.schedules) {
    const found = scheduleFees(firm, schedule, readings)
    const where = schedule.platform ? `${schedule.platform.name}: ` : ''
    if (Object.keys(found).length === 0) {
      unreadable.push(
        `${where}no fees found on ${titlesFor(firm, schedule)}; the page may have changed shape.`,
      )
      continue
    }
    const priced = supported
      ? Object.keys(found).filter((s) => supported.has(s))
      : Object.keys(found)
    const unit = firm.quoted === 'perSide' ? ' a side' : ''
    for (const sym of priced) {
      const was = schedule.fees[sym]
      const now = found[sym]
      if (was === undefined) {
        notes.push(
          contractBySymbol(sym)
            ? `${where}${sym} is now priced, at ${money(now)}${unit}.`
            : `${where}${sym} is priced at ${money(now)}${unit} but is not in CONTRACTS; it needs CME’s tick specs first.`,
        )
      } else if (was !== now) {
        notes.push(`${where}${sym} went from ${money(was)} to ${money(now)}${unit}.`)
      }
    }
    for (const sym of Object.keys(schedule.fees)) {
      if (!priced.includes(sym)) {
        notes.push(`${where}${sym} is no longer priced${supported ? ' and supported' : ''}.`)
      }
    }
  }

  const restricted = merged(readings, (r) => r.restricted)
  if (restricted) {
    const listed = Object.keys(firm.restricted ?? {})
    for (const sym of restricted) {
      if (!listed.includes(sym)) notes.push(`${sym} is now restricted.`)
    }
    for (const sym of listed) {
      if (!restricted.has(sym)) notes.push(`${sym} is no longer restricted.`)
    }
  }

  if (unreadable.length > 0) return { kind: 'unreadable', notes: unreadable }
  if (notes.length > 0) return { kind: 'changed', notes }
  return { kind: 'confirmed' }
}

/** The sources that price a schedule: its platform's, or all of them. */
function forSchedule(firm: FirmContracts, schedule: FeeSchedule): FeeSource[] {
  return firm.sources.filter(
    (s) => !schedule.platform || !s.platform || s.platform === schedule.platform.id,
  )
}

function scheduleFees(
  firm: FirmContracts,
  schedule: FeeSchedule,
  readings: Map<FeeSource, Reading>,
): Record<string, number> {
  return Object.assign(
    {},
    ...forSchedule(firm, schedule).map((s) => readings.get(s)?.fees ?? {}),
  )
}

function titlesFor(firm: FirmContracts, schedule: FeeSchedule): string {
  return forSchedule(firm, schedule)
    .map((s) => s.title)
    .join(' and ')
}

/** Everything the readings say for one field, or undefined if none read it. */
function merged(
  readings: Map<FeeSource, Reading>,
  field: (r: Reading) => string[] | undefined,
): Set<string> | undefined {
  const lists = [...readings.values()].map(field).filter((l) => l !== undefined)
  return lists.length > 0 ? new Set(lists.flat()) : undefined
}

/**
 * Whether an outcome wants a person. A change or an unreadable page does at
 * once. A page that would not load does only once the firm's date has gone
 * stale: outages pass, and a firm that turns automated checks away is
 * checked by hand, so it should only nag when that has been let slip.
 */
export function needsAttention(
  firm: FirmContracts,
  outcome: Outcome,
  today: string,
): boolean {
  if (outcome.kind === 'confirmed') return false
  if (outcome.kind === 'unreachable') return isStale(firm.checked, today)
  return true
}

/** The dates file with every confirmed firm moved forward to `today`. */
export function nextDates(
  dates: Record<string, string>,
  outcomes: Map<FirmContracts, Outcome>,
  today: string,
): Record<string, string> {
  const next = { ...dates }
  for (const [firm, outcome] of outcomes) {
    if (outcome.kind === 'confirmed') next[firm.firmId] = today
  }
  return next
}

const HEADINGS: Record<Exclude<Outcome['kind'], 'confirmed'>, string> = {
  changed: 'its pages have changed',
  unreadable: 'its pages did not read as expected',
  unreachable: 'its pages could not be loaded',
}

/**
 * The issue body for the firms that need attention. It carries no relative
 * dates or counts, so a day that finds the same thing writes the same text
 * and the workflow can tell there is nothing new to say.
 */
export function report(
  outcomes: Map<FirmContracts, Outcome>,
  today: string,
): string {
  const sections: string[] = []
  for (const [firm, outcome] of outcomes) {
    if (outcome.kind === 'confirmed' || !needsAttention(firm, outcome, today)) {
      continue
    }
    const name = firmOf(firm.firmId).name
    const pages = firm.sources.map((s) => `[${s.title}](${s.url})`).join(', ')
    const lines = [
      `### ${name}: ${HEADINGS[outcome.kind]}`,
      '',
      `Last confirmed ${formatLongDate(firm.checked)}. Pages: ${pages}.`,
      '',
      ...outcome.notes.map((n) => `- ${n}`),
    ]
    if (outcome.kind === 'unreachable') {
      lines.push(
        '',
        `If ${name} turns automated checks away, run \`npm run check-fees -- --browser\` on your own machine: it opens the pages in a visible browser, where you can clear any challenge yourself.`,
      )
    }
    sections.push(lines.join('\n'))
  }
  if (sections.length === 0) return ''
  return [
    'The daily fee check found something the calculator should not go on showing as confirmed.',
    '',
    'Check each item on the firm’s own page, correct `src/lib/contracts.ts` (the add-prop-firm skill has the procedure), then run `npm run check-fees` and commit the dates it moves forward. The firm’s date in the calculator stays put until then.',
    '',
    ...sections.flatMap((s) => [s, '']),
  ]
    .join('\n')
    .trimEnd()
}
