/**
 * Prop firms, their account types, and the sizes each type comes in. Picking a
 * size fills in the firm's rules: where the balance starts, the balance a max
 * payout needs, the consistency rule, how many trading days a payout needs,
 * and any minimum payout.
 *
 * The three levels answer different questions. A firm brings the theme and the
 * logo; a type (Builder, Growth) brings the rules that hold across its sizes;
 * a size brings the money, its payout schedule. The rules stay editable
 * afterwards; a template is a starting point.
 */

import mffuLogo from '@/assets/brands/mffu.svg'
import tradeifyLogo from '@/assets/brands/tradeify.svg'

export interface Firm {
  id: string
  name: string
  /** The color theme applied when this firm is picked. */
  themeId: string
  /**
   * The firm's own logo. Both are the white-on-dark versions from the firms'
   * site headers, so light grounds need a dark plate behind them; that's what
   * `FirmLogo` does.
   */
  logo: { src: string; alt: string }
}

export const FIRMS: readonly Firm[] = [
  {
    id: 'mffu',
    name: 'MyFundedFutures',
    themeId: 'mffu',
    logo: { src: mffuLogo, alt: 'MyFundedFutures logo' },
  },
  {
    id: 'tradeify',
    name: 'Tradeify',
    themeId: 'tradeify',
    logo: { src: tradeifyLogo, alt: 'Tradeify logo' },
  },
]

/** An account type, e.g. a MyFundedFutures Builder or a Tradeify Growth. */
export interface AccountProgram {
  id: string
  firmId: string
  /** The type's own name, without a size: "Builder", "Growth". */
  name: string
  /**
   * When a firm changed a type's payout terms, accounts bought before the
   * cutoff keep the old schedule. Only set where sizes carry a `before`
   * schedule to go with it.
   */
  cutoff?: { date: string; time: string }
}

export const ACCOUNT_PROGRAMS: readonly AccountProgram[] = [
  { id: 'mffu-builder', firmId: 'mffu', name: 'Builder' },
  {
    id: 'tradeify-growth',
    firmId: 'tradeify',
    name: 'Growth',
    cutoff: { date: 'September 12, 2025', time: '8:00 AM EST' },
  },
  {
    id: 'tradeify-lightning',
    firmId: 'tradeify',
    name: 'Lightning',
    cutoff: { date: 'September 12, 2025', time: '8:00 AM EST' },
  },
]

/**
 * What one account may withdraw, and what it takes to get there.
 *
 * Firms cap a payout by how many you have already taken, so `caps` is the most
 * you can withdraw per request, by payout number; the last entry holds for
 * every payout after it. A payout also has to leave `floor` behind, so the
 * balance a max payout needs is the qualifying balance or floor plus cap,
 * whichever is higher.
 */
export interface PayoutSchedule {
  /** Max withdrawal per request, by payout number. The last entry repeats. */
  caps: readonly number[]
  /**
   * Profit to earn since the last payout before one can be requested, by
   * payout number. Absent where a firm gates on balance instead; where it is
   * set the goal resets each cycle, so nothing carries over.
   */
  goals?: readonly number[]
  /**
   * Consistency rule by payout number, where a firm raises it as payouts add
   * up. Absent where one rule holds throughout, which is the template's own.
   */
  consistencies?: readonly number[]
  /** The smallest request the firm accepts. */
  minimumPayout: number
  /** The balance a payout request needs at all, 0 where none is published. */
  qualifyingBalance: number
  /** What has to remain afterwards. */
  floor: number
  /**
   * Whether the floor fails the account rather than merely being held back.
   * A trailing drawdown breaches at or below its level, so a payout has to
   * leave a buffer above it, not land on it; MyFundedFutures fixes its own
   * buffer at $2,100 and the floor is simply withheld.
   */
  floorBreaches?: boolean
}

/** Which schedule an account is on: when it was bought decides. */
export type Era = 'current' | 'before'

/** One size of one account type, with the rules that come with it. */
export interface AccountTemplate {
  id: string
  /** The account type this size belongs to, keyed into `ACCOUNT_PROGRAMS`. */
  programId: string
  /** The size on its own: "50k". */
  name: string
  /**
   * What the balance starts at. Zero when the firm reports profit rather than
   * a running balance (MyFundedFutures); the account size otherwise.
   */
  startingBalance: number
  /** Fraction: 0.5 means no day may top 50% of net profit. */
  consistency: number
  /** Trading days needed since the last payout before a payout is allowed. */
  minTradingDays: number
  /**
   * Profit a day must beat to count as one of those trading days. Zero where
   * the firm counts every day traded, win or lose.
   */
  qualifyingDayProfit: number
  /**
   * The account's trailing max drawdown, where the firm publishes one. Used
   * to judge whether the room a payout leaves is thin: it is what the account
   * had to play with in the first place.
   */
  drawdown?: number
  payout: PayoutSchedule
  /** The schedule for accounts bought before the type's cutoff, if there is one. */
  before?: PayoutSchedule
}

export const ACCOUNT_TEMPLATES: readonly AccountTemplate[] = [
  {
    // The same shape as the 50k below, halved: the buffer is the account's
    // max loss limit plus $100, and the minimum payout is the profit the firm
    // wants above that buffer.
    id: 'mffu-25k-builder',
    programId: 'mffu-builder',
    name: '25k',
    startingBalance: 0,
    consistency: 0.5,
    minTradingDays: 2,
    qualifyingDayProfit: 0,
    payout: {
      caps: [1000],
      minimumPayout: 250,
      qualifyingBalance: 0,
      floor: 1100,
    },
  },
  {
    // The workbook's own account: its payout buffer is the floor, and its
    // payout cap the one withdrawal cap, so the two still add to $4,100.
    id: 'mffu-50k-builder',
    programId: 'mffu-builder',
    name: '50k',
    startingBalance: 0,
    consistency: 0.5,
    minTradingDays: 2,
    qualifyingDayProfit: 0,
    payout: {
      caps: [2000],
      minimumPayout: 500,
      qualifyingBalance: 0,
      floor: 2100,
    },
  },
  {
    id: 'tradeify-25k-growth',
    programId: 'tradeify-growth',
    name: '25k',
    startingBalance: 25000,
    consistency: 0.35,
    minTradingDays: 5,
    qualifyingDayProfit: 100,
    drawdown: 1000,
    payout: {
      caps: [1000],
      minimumPayout: 250,
      qualifyingBalance: 26500,
      floor: 25100,
      floorBreaches: true,
    },
    // The 25k is not in the firm's before-cutoff tables; it has one schedule.
  },
  {
    id: 'tradeify-50k-growth',
    programId: 'tradeify-growth',
    name: '50k',
    startingBalance: 50000,
    consistency: 0.35,
    minTradingDays: 5,
    qualifyingDayProfit: 150,
    drawdown: 2000,
    payout: {
      caps: [1500, 2000, 2500, 3000],
      minimumPayout: 500,
      qualifyingBalance: 53000,
      floor: 50100,
      floorBreaches: true,
    },
    before: {
      caps: [1500, 1750, 2000, 2250, 2500, 3000, 25000],
      minimumPayout: 500,
      qualifyingBalance: 52100,
      floor: 50100,
      floorBreaches: true,
    },
  },
  {
    id: 'tradeify-100k-growth',
    programId: 'tradeify-growth',
    name: '100k',
    startingBalance: 100000,
    consistency: 0.35,
    minTradingDays: 5,
    qualifyingDayProfit: 200,
    drawdown: 3500,
    payout: {
      caps: [2000, 2500, 3000, 4000],
      minimumPayout: 1000,
      qualifyingBalance: 104500,
      floor: 100100,
      floorBreaches: true,
    },
    before: {
      caps: [2000, 2500, 3000, 3500, 4000, 5000, 25000],
      minimumPayout: 1000,
      qualifyingBalance: 103600,
      floor: 100100,
      floorBreaches: true,
    },
  },
  {
    id: 'tradeify-150k-growth',
    programId: 'tradeify-growth',
    name: '150k',
    startingBalance: 150000,
    consistency: 0.35,
    minTradingDays: 5,
    qualifyingDayProfit: 250,
    drawdown: 5000,
    payout: {
      caps: [2500, 3000, 4000, 5000],
      minimumPayout: 1500,
      qualifyingBalance: 156500,
      floor: 150100,
      floorBreaches: true,
    },
    before: {
      caps: [2500, 3000, 3500, 4000, 4500, 5500, 25000],
      minimumPayout: 1500,
      qualifyingBalance: 155100,
      floor: 150100,
      floorBreaches: true,
    },
  },
  {
    id: 'tradeify-25k-lightning',
    programId: 'tradeify-lightning',
    name: '25k',
    startingBalance: 25000,
    // The rule for a first payout; it rises with the payout number below.
    consistency: 0.2,
    minTradingDays: 0,
    qualifyingDayProfit: 0,
    drawdown: 1000,
    payout: {
      caps: [1000],
      goals: [1500, 1000],
      consistencies: [0.2, 0.25, 0.3],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 25100,
      floorBreaches: true,
    },
    before: {
      caps: [1000],
      goals: [1500, 1000],
      // Accounts bought before the cutoff keep 20% for every payout.
      consistencies: [0.2],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 25100,
      floorBreaches: true,
    },
  },
  {
    id: 'tradeify-50k-lightning',
    programId: 'tradeify-lightning',
    name: '50k',
    startingBalance: 50000,
    // The rule for a first payout; it rises with the payout number below.
    consistency: 0.2,
    minTradingDays: 0,
    qualifyingDayProfit: 0,
    drawdown: 2000,
    payout: {
      caps: [2000, 2000, 2000, 2500],
      goals: [3000, 2000],
      consistencies: [0.2, 0.25, 0.3],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 50100,
      floorBreaches: true,
    },
    before: {
      caps: [2000, 2000, 2000, 2500],
      goals: [3000, 2000],
      // Accounts bought before the cutoff keep 20% for every payout.
      consistencies: [0.2],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 50100,
      floorBreaches: true,
    },
  },
  {
    id: 'tradeify-100k-lightning',
    programId: 'tradeify-lightning',
    name: '100k',
    startingBalance: 100000,
    // The rule for a first payout; it rises with the payout number below.
    consistency: 0.2,
    minTradingDays: 0,
    qualifyingDayProfit: 0,
    drawdown: 4000,
    payout: {
      caps: [2500, 2500, 2500, 3000],
      goals: [6000, 3500],
      consistencies: [0.2, 0.25, 0.3],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 100100,
      floorBreaches: true,
    },
    before: {
      caps: [2500, 2500, 2500, 3000],
      goals: [6000, 3000, 2500],
      // Accounts bought before the cutoff keep 20% for every payout.
      consistencies: [0.2],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 100100,
      floorBreaches: true,
    },
  },
  {
    id: 'tradeify-150k-lightning',
    programId: 'tradeify-lightning',
    name: '150k',
    startingBalance: 150000,
    // The rule for a first payout; it rises with the payout number below.
    consistency: 0.2,
    minTradingDays: 0,
    qualifyingDayProfit: 0,
    drawdown: 5250,
    payout: {
      caps: [3000, 3000, 3000, 3500],
      goals: [9000, 4500],
      consistencies: [0.2, 0.25, 0.3],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 150100,
      floorBreaches: true,
    },
    before: {
      caps: [3000, 3000, 3000, 3500],
      goals: [9000, 4500, 3000],
      // Accounts bought before the cutoff keep 20% for every payout.
      consistencies: [0.2],
      minimumPayout: 1000,
      qualifyingBalance: 0,
      floor: 150100,
      floorBreaches: true,
    },
  },
]

/**
 * Where an account publishes no drawdown to scale against, the buffer starts
 * here: small, but more than nothing, since a balance that lands on the floor
 * has already failed.
 */
export const DEFAULT_PAYOUT_BUFFER = 100

/**
 * Room thinner than this share of the account's own drawdown gets a warning.
 * Not a firm rule: a yardstick, because room is only meaningful next to how
 * much the account had to lose in the first place.
 */
export const THIN_ROOM_SHARE = 0.25

/** Whether the room a payout leaves is thin for the account's drawdown. */
export function roomIsThin(
  template: AccountTemplate,
  room: number | null,
): boolean {
  if (room === null || template.drawdown === undefined) return false
  return room < template.drawdown * THIN_ROOM_SHARE
}

/**
 * The payout buffer an account starts on: a quarter of its drawdown, rounded
 * up to a round figure. That is the same line `roomIsThin` draws, so the app
 * never opens on a target it would itself warn about.
 *
 * It has to scale with the account rather than be one flat number, because a
 * firm's qualifying balance covers the early payouts and nothing else: on a
 * 50k Growth it leaves $1,400 at the first payout, $900 at the second, $400 at
 * the third, and by the fourth the cap has grown enough to reach the floor.
 */
export function defaultBuffer(template: AccountTemplate): number {
  if (!template.drawdown) return DEFAULT_PAYOUT_BUFFER
  return Math.ceil((template.drawdown * THIN_ROOM_SHARE) / 50) * 50
}

/** The account the app opens with: the workbook's own 50k Builder. */
export const DEFAULT_TEMPLATE = 'mffu-50k-builder'

export function accountTemplate(id: string): AccountTemplate {
  return (
    ACCOUNT_TEMPLATES.find((t) => t.id === id) ??
    ACCOUNT_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE) ??
    ACCOUNT_TEMPLATES[0]
  )
}

/** The firm for an id, falling back to the first for unknown ids. */
export function firm(id: string): Firm {
  return FIRMS.find((f) => f.id === id) ?? FIRMS[0]
}

/** The account type for an id, falling back to the first for unknown ids. */
export function program(id: string): AccountProgram {
  return ACCOUNT_PROGRAMS.find((p) => p.id === id) ?? ACCOUNT_PROGRAMS[0]
}

export function programOf(template: AccountTemplate): AccountProgram {
  return program(template.programId)
}

export function firmOf(template: AccountTemplate): Firm {
  return firm(programOf(template).firmId)
}

/** A firm's account types, in registry order. */
export function programsFor(firmId: string): AccountProgram[] {
  return ACCOUNT_PROGRAMS.filter((p) => p.firmId === firmId)
}

/** The sizes an account type comes in, in registry order. */
export function sizesFor(programId: string): AccountTemplate[] {
  return ACCOUNT_TEMPLATES.filter((t) => t.programId === programId)
}

/** Every account a firm offers, across its types. */
export function accountsFor(firmId: string): AccountTemplate[] {
  return programsFor(firmId).flatMap((p) => sizesFor(p.id))
}

/** "50k Builder": the account without its firm. */
export function accountLabel(template: AccountTemplate): string {
  return `${template.name} ${programOf(template).name}`
}

/** "MyFundedFutures 50k Builder" */
export function templateLabel(template: AccountTemplate): string {
  return `${firmOf(template).name} ${accountLabel(template)}`
}

/** The schedule an account is on, falling back to the current one. */
export function scheduleFor(
  template: AccountTemplate,
  era: Era = 'current',
): PayoutSchedule {
  return era === 'before' ? (template.before ?? template.payout) : template.payout
}

/** Whether the trader has anything to say about this account's schedule. */
export function hasSchedule(template: AccountTemplate): boolean {
  return graduates(template.payout) || template.before !== undefined
}

/** The payout being worked towards: the one after those already taken. */
export function nextPayoutNumber(payoutsSoFar: number): number {
  return Math.max(1, Math.floor(payoutsSoFar) + 1)
}

/** The entry for a payout number, with the last one holding from there on. */
function byPayout(steps: readonly number[], payoutsSoFar: number): number {
  const n = nextPayoutNumber(payoutsSoFar)
  return steps[Math.min(n, steps.length) - 1]
}

/** The most one request may withdraw, at that payout number. */
export function payoutCap(schedule: PayoutSchedule, payoutsSoFar: number): number {
  return byPayout(schedule.caps, payoutsSoFar)
}

/**
 * Profit to earn since the last payout before this one unlocks, or 0 where
 * the firm gates on balance instead.
 */
export function profitGoal(schedule: PayoutSchedule, payoutsSoFar: number): number {
  return schedule.goals ? byPayout(schedule.goals, payoutsSoFar) : 0
}

/** The consistency rule at that payout number, as a fraction. */
export function consistencyFor(
  template: AccountTemplate,
  era: Era = 'current',
  payoutsSoFar = 0,
): number {
  const { consistencies } = scheduleFor(template, era)
  return consistencies ? byPayout(consistencies, payoutsSoFar) : template.consistency
}

/** Whether a schedule's terms move with the payout number at all. */
export function graduates(schedule: PayoutSchedule): boolean {
  return (
    schedule.caps.length > 1 ||
    (schedule.goals?.length ?? 0) > 1 ||
    (schedule.consistencies?.length ?? 0) > 1
  )
}

/** How much room a payout of that size leaves above a breaching floor. */
export function drawdownRoomAt(
  schedule: PayoutSchedule,
  payoutsSoFar: number,
  balance: number,
): number | null {
  if (!schedule.floorBreaches) return null
  return balance - payoutCap(schedule, payoutsSoFar) - schedule.floor
}

/**
 * The balance a max payout needs. It has to clear the firm's qualifying
 * balance and still leave the floor behind once the cap is withdrawn, so a
 * later, bigger cap can ask for more than the published minimum.
 *
 * Where the floor fails the account, landing exactly on it is a breach, so
 * `buffer` is what the trader wants the payout to leave above it.
 */
export function payoutThreshold(
  schedule: PayoutSchedule,
  payoutsSoFar: number,
  buffer = DEFAULT_PAYOUT_BUFFER,
): number {
  const keep = schedule.floorBreaches ? Math.max(0, buffer) : 0
  return Math.max(
    schedule.qualifyingBalance,
    schedule.floor + payoutCap(schedule, payoutsSoFar) + keep,
  )
}

/** The editable account rules, as typed into the dashboard. */
export type RuleKey =
  | 'startingBalance'
  | 'payoutThreshold'
  | 'profitGoal'
  | 'minimumPayout'
  | 'consistency'
  | 'minTradingDays'
  | 'qualifyingDayProfit'

export type AccountKey = 'balance' | RuleKey

/** A template's rules as field values, on its schedule and payout number. */
export function rulesFor(
  template: AccountTemplate,
  era: Era = 'current',
  payoutsSoFar = 0,
  buffer = DEFAULT_PAYOUT_BUFFER,
): Record<RuleKey, string> {
  const schedule = scheduleFor(template, era)
  return {
    startingBalance: String(template.startingBalance),
    payoutThreshold: String(payoutThreshold(schedule, payoutsSoFar, buffer)),
    profitGoal: String(profitGoal(schedule, payoutsSoFar)),
    minimumPayout: String(schedule.minimumPayout),
    // Rounded because a fraction like 0.35 * 100 can land just off.
    consistency: String(
      Math.round(consistencyFor(template, era, payoutsSoFar) * 10000) / 100,
    ),
    minTradingDays: String(template.minTradingDays),
    qualifyingDayProfit: String(template.qualifyingDayProfit),
  }
}

/** A fresh account: the template's rules, with the balance at its start. */
export function accountFor(
  template: AccountTemplate,
  era: Era = 'current',
  payoutsSoFar = 0,
  buffer = DEFAULT_PAYOUT_BUFFER,
): Record<AccountKey, string> {
  return {
    balance: String(template.startingBalance),
    ...rulesFor(template, era, payoutsSoFar, buffer),
  }
}
