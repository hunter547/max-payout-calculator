/**
 * How far a trade has to run to net a given amount, once the firm's fees and
 * the trader's slippage are paid. Per contract, a trade that runs `t` ticks
 * nets
 *
 *   (t − slippage) × tick value − round-trip fee
 *
 * and `quantity` contracts net that many times over. The ticks needed are
 * that solved for `t`:
 *
 *   t = target / (quantity × tick value) + fee / tick value + slippage
 *
 * A trade moves in whole ticks, so `t` is rounded — and which way depends on
 * what the amount is. A target to reach rounds up, or the trade stops short
 * of it. A ceiling to stay under — the consistency rule's daily cap — rounds
 * down, because a tick past the cap raises the payout target, which is the
 * one thing the cap is there to prevent.
 */

export interface ContractSpec {
  /** Smallest price move, in points: 0.25 for ES, 0.01 for CL. */
  tickSize: number
  /** Dollars one tick is worth on one contract: $12.50 for ES. */
  tickValue: number
}

export interface TradeCosts {
  /** Contracts traded; each pays its own fee and slips on its own. */
  quantity: number
  /** The firm's fee for one contract in and out again. */
  roundTripFee: number
  /** Ticks lost per contract across the entry and the exit together. */
  slippageTicks: number
}

/** Reach the amount at least, or keep under it at most. */
export type Aim = 'reach' | 'stayUnder'

export interface TicksNeeded {
  ticks: number
  /** The same move in points, the way a chart's price scale reads it. */
  points: number
  /** What the trade makes before anything comes off it. */
  gross: number
  fees: number
  slippage: number
  /** What lands in the account: gross less fees and slippage. */
  net: number
}

/**
 * Binary-float dust turns an exact 7 ticks into 7.000000000000001, and the
 * ceiling of that is a tick the trade does not need. Settle it first.
 */
function settle(value: number): number {
  return Number(value.toPrecision(12))
}

/**
 * The whole ticks a trade needs to net `amount`, or null when no trade can:
 * an amount of nothing, a contract count that is not a whole positive number,
 * or a ceiling too low for even the best tick under it to clear the costs.
 */
export function ticksNeeded(
  amount: number,
  contract: ContractSpec,
  costs: TradeCosts,
  aim: Aim,
): TicksNeeded | null {
  const { quantity, roundTripFee, slippageTicks } = costs
  if (!(amount > 0) || !Number.isInteger(quantity) || quantity < 1) return null
  if (!(contract.tickValue > 0) || !(contract.tickSize > 0)) return null
  if (!(roundTripFee >= 0) || !(slippageTicks >= 0)) return null

  const exact = settle(
    amount / (quantity * contract.tickValue) +
      roundTripFee / contract.tickValue +
      slippageTicks,
  )
  const ticks = aim === 'reach' ? Math.ceil(exact) : Math.floor(exact)

  const gross = quantity * ticks * contract.tickValue
  const fees = quantity * roundTripFee
  const slippage = quantity * slippageTicks * contract.tickValue
  const net = gross - fees - slippage
  // Under a ceiling, the best tick may still leave the trade paying to trade.
  if (!(net > 0)) return null

  return {
    ticks,
    points: settle(ticks * contract.tickSize),
    gross,
    fees,
    slippage,
    net,
  }
}
