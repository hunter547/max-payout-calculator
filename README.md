# Max Payout Calculator

A React + TypeScript app for working through a MyFundedFutures 50k Builder
payout cycle. Log each trading day's P&L since your last payout and it tells you
how many more days you need, how much to make each day, and the most any one
day can make before the consistency rule raises the target.

The calculations are ported from
`MyFundedFutrures 50k Builder Max Payout Calculator.xlsx`.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
npm run lint
npm test         # calculation parity, ledger, and UI tests
```

## What you enter

- **Days since last payout.** One row per trading day: date and P&L. Losing
  days count. Edit or remove any row inline; "Start a new cycle" clears the
  list once a payout is approved.
- **Account.** Balance, payout buffer, payout cap, and the consistency rule.
  These default to the values saved in the spreadsheet.

From the ledger the app derives the two inputs you used to type into the sheet:

| Sheet cell | Now derived as |
|------------|----------------|
| `D3` Largest Profit Day | the biggest winning day (0 until you have one) |
| `F3` Current Net Profit | the sum of every day, losses included |

Everything is saved in your browser's `localStorage` (`mpc.days`,
`mpc.account`, `mpc.theme`). Nothing is sent anywhere.

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

[`src/lib/ledger.ts`](src/lib/ledger.ts) turns the ledger into `D3` and `F3`,
and dates the planned days on the next weekdays, starting no earlier than today.

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
  cobalt for the daily cap and planned days. Tokens live in
  [`src/index.css`](src/index.css).
- **Chart colors are validated,** not eyeballed, for colorblind separation and
  contrast in both themes. In dark mode, profit is the lighter step and loss the
  deeper one (the reverse of light mode) so the pair stays distinct under
  protanopia. The chart also encodes profit and loss by direction from the
  baseline, and the ledger doubles as its table view.

## UI components

Built on [shadcn/ui](https://ui.shadcn.com) (new-york style, Tailwind v4):
`button`, `input`, `label`, `table`, `badge`, `separator`, `tooltip`, `alert`,
in `src/components/ui/`. The P&L chart is hand-built SVG in
`src/components/PnlChart.tsx`.

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
  saved inputs, plus the branch and edge cases above.
- `src/lib/ledger.test.ts`: largest day and net profit from daily entries,
  pasted formatting like `$1,200`, and weekend-aware plan dates.
- `src/App.test.tsx`: mounts the app in jsdom, logs a history that reproduces
  the workbook (`+359`, `−212.40`, `−140` → `$355.70` a day for two days), and
  covers editing, removing, invalid input, and the target-met state.

## Node version

The installed Node is 20.11.0, which pins a few tools below their latest
versions:

| Tool | Pinned | Latest needs |
|------|--------|--------------|
| Vite | 6 | Vite 7 needs `^20.19.0 \|\| >=22.12.0` |
| shadcn CLI | 3.8.5 | 4.x needs `>=20.18.1` |
| jsdom | 25 | 26+ needs `require(esm)` support |

Upgrading to Node 22 LTS lifts all three.
