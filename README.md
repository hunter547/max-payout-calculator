# Max Payout Calculator

A React + TypeScript app for working through a MyFundedFutures 50k Builder
payout cycle. It tells you how many more trading days you need, how much to make
each day, and the most any one day can make before the consistency rule raises
the target.

The calculations are ported from
`MyFundedFutrures 50k Builder Max Payout Calculator.xlsx`.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
npm run lint
npm test         # calculation parity, ledger, setup, and UI tests
```

## First visit: the walkthrough

With nothing in local storage, the app opens a short screen-by-screen
walkthrough instead of the dashboard. It starts with one question: how do you
want to track this payout?

**Point-in-time.** Copy three numbers from your account, one per screen:

1. Current balance
2. Largest profit day
3. Cumulative profit since the last payout (it resets after each payout)

**Day-by-day.** Log each trading day instead:

1. Have you taken a payout from this account yet?
2. If yes: your current balance. If not, this screen is skipped and the balance
   is worked out from your logged days.
3. Each day's profit or loss, positive or negative. You can add more later.

Both paths end on one last question: **Conservative or Aggressive?** Each card
previews the plan it would give you for the numbers you just entered.

"Show my plan" on the last screen saves everything and opens the dashboard.
"Change approach" in the dashboard header reopens the walkthrough, prefilled,
and "Keep my current setup" backs out without changing anything.

Storage from before the walkthrough existed (logged days but no setup) skips it
and opens as day-by-day with the balance you'd entered.

### About the balance

Once an account is funded, its balance starts at $0, and that's the balance the
app asks for. The spreadsheet's formula compares it against payout buffer plus
payout cap ($4,100). Before any payout, the balance is the sum of every day
since the account was funded, which is how day-by-day works it out.

## The dashboard

- **Headline and chart:** how many more days at how much each, plotted against
  the daily cap. Logged days are solid columns; planned days are outlined.
- **Day-by-day:** a ledger of each day's P&L, edited inline. An "I've taken a
  payout" switch chooses between an entered and a derived balance.
- **Point-in-time:** "Your numbers" holds the three values from the walkthrough.
- **Account:** payout buffer, payout cap, and consistency rule, defaulting to the
  spreadsheet's values.
- **How the target is set:** which rule is driving the profit you need.

Largest profit day and cumulative profit map to the sheet like this:

| Sheet cell | Point-in-time | Day-by-day |
|------------|---------------|------------|
| `A3` Balance | entered | entered after a payout, else sum of logged days |
| `D3` Largest Profit Day | entered | biggest winning day (0 until you have one) |
| `F3` Current Net Profit | entered | sum of every day, losses included |

Everything is saved in your browser's `localStorage` (`mpc.setup`,
`mpc.account`, `mpc.snapshot`, `mpc.days`, `mpc.theme`). Nothing is sent
anywhere.

## The calculations

[`src/lib/calc.ts`](src/lib/calc.ts) is a cell-for-cell port of `Sheet1`:

| Cell | Name | Formula |
|------|------|---------|
| `E3` | Minimum target net profit | `=MAX(500, (B3+C3)-A3)` |
| `H3` | Minimum net profit required | `=MAX(E3, ABS(D3)/G3)` |
| `I3` | Remaining profit needed | `=H3-F3` |
| `J3` | Minimum trading days left | `=CEILING.MATH(I3/(H3*G3))` |
| `K3` | Daily profit needed (equal split) | `=I3/J3` |

`H3 × G3` is the **daily cap**: the most one day can contribute without breaking
the consistency rule. Because `H3` is at least `largest day ÷ G3`, your largest
day can never exceed the cap, and `J3` spreads the remaining profit so each
planned day stays under it too. Make a bigger day than the cap and `H3` rises.

[`src/lib/ledger.ts`](src/lib/ledger.ts) turns logged days into `D3` and `F3`,
and dates the planned days on the next weekdays, starting no earlier than today.

### Conservative and aggressive plans

Switch between them with the **Plan** toggle above the chart.

- **Conservative** is the spreadsheet's plan: `J3` days of `K3`. Every planned
  day stays at or under the daily cap, which is the default cap (`E3 × G3`) or
  your largest profit day, whichever is higher. Your largest day never grows,
  so the target never moves.
- **Aggressive** is the fewest days to payout, whatever each day has to make.
  Days bigger than your largest day raise the target, and the plan counts that.

For `n` equal days of `x`, with `F` = net profit, `D` = largest day, `E` =
minimum target and `G` = consistency, the final total `T = F + n·x` must satisfy
`T ≥ E` and `max(D, x) ≤ G·T`. That reduces to `x ≥ I3 / n` plus
`x·(1 − G·n) ≤ G·F`, and `planFor` in `calc.ts` takes the smallest `n` where a
valid `x` exists. Equal days are optimal, since for a given total they keep the
largest day as small as possible, and the conservative plan always satisfies
the same rules, so aggressive is never slower.

Example: at −$1,050 cumulative profit with a $500 largest day and a 50% rule,
conservative takes 5 days of $410; aggressive takes 3 days of $1,050, lifting
the profit target from $1,000 to $2,100. With profit already banked the two
usually agree, and the walkthrough says so when they do.

### Deliberate differences from the spreadsheet

The sheet leaves three situations as raw Excel errors. The app handles them
instead, and the tests pin each one:

1. **Target already met** (`I3 <= 0`). The sheet gives `K3 = #DIV/0!`. The app
   shows "Payout target reached".
2. **Zero consistency rule** (`G3 = 0`). `ABS(D3)/G3` is `#DIV/0!` in Excel. The
   app flags the field and falls back to the minimum target.
3. **Floating-point dust in `CEILING.MATH`.** Excel evaluates at 15 significant
   digits; IEEE 754 doesn't, so a ratio of exactly `2` can land on
   `2.0000000000000004` and round up to `3`. The port settles the ratio to 12
   significant digits first.

## Design

- **Type:** Archivo variable, one family, using its width axis: expanded and
  heavy for headings, condensed with tabular figures for money.
- **Color:** cool fog paper, graphite ink, jade profit, signal red loss, and
  cobalt for the daily cap, planned days, and walkthrough progress. Tokens live
  in [`src/index.css`](src/index.css).
- **Chart colors are validated,** not eyeballed, for colorblind separation and
  contrast in both themes. In dark mode, profit is the lighter step and loss the
  deeper one (the reverse of light mode) so the pair stays distinct under
  protanopia. The chart also encodes profit and loss by direction from the
  baseline, and the ledger doubles as its table view.
- **Motion:** one short fade-and-rise as each walkthrough screen appears.
  Reduced-motion settings turn it off.

## UI components

Built on [shadcn/ui](https://ui.shadcn.com) (new-york style, Tailwind v4):
`alert`, `badge`, `button`, `input`, `label`, `progress`, `radio-group`,
`separator`, `switch`, `table`, and `tooltip`, in `src/components/ui/`. The P&L
chart is hand-built SVG in `src/components/PnlChart.tsx`.

To add another component:

```bash
npx shadcn@3.8.5 add <component>
```

Then change its `import { cn } from "cn"` line to
`import { cn } from "@/lib/utils"`. The CLI now writes imports for shadcn's
`cn` package; this project uses the equivalent `clsx` + `tailwind-merge` helper
in `src/lib/utils.ts`. If the CLI installs `cn` into `package.json`, remove it.

## Tests

- `src/lib/calc.test.ts`: the port reproduces every cached formula result in
  the workbook (`E3=500`, `H3=718`, `I3=711.4`, `J3=2`, `K3=355.7`) from its
  saved inputs, plus the branch and edge cases above. The aggressive plan is
  checked across a sweep of balances, drawdowns, largest days, and consistency
  rules: it always pays out, is never slower than conservative, and a brute-force
  search confirms no daily amount gets there a day sooner.
- `src/lib/ledger.test.ts`: largest day and net profit from daily entries,
  pasted formatting like `$1,200`, and weekend-aware plan dates.
- `src/lib/setup.test.ts`: which walkthrough screens each path shows, and
  detecting storage from before the walkthrough.
- `src/App.test.tsx`: mounts the app in jsdom and walks both walkthrough paths
  to the workbook's `$355.70` a day, covers the no-payout path's derived
  balance, validation, reopening and cancelling, and both dashboards' editing,
  removing, invalid input, and target-met states.

## Node version

The installed Node is 20.11.0, which pins a few tools below their latest
versions:

| Tool | Pinned | Latest needs |
|------|--------|--------------|
| Vite | 6 | Vite 7 needs `^20.19.0 \|\| >=22.12.0` |
| shadcn CLI | 3.8.5 | 4.x needs `>=20.18.1` |
| jsdom | 25 | 26+ needs `require(esm)` support |

Upgrading to Node 22 LTS lifts all three.
