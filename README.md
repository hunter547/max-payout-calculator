# Max Payout Calculator

A React + TypeScript app for working through a funded-account payout cycle. It
tells you how many more trading days you need, how much to make each day, and
the most any one day can make before the consistency rule raises the target.

Pick your prop firm, account type and size, and the firm's rules fill in for
you. MyFundedFutures and Tradeify accounts ship with the app; see
[Account templates](#account-templates).

The calculations are ported from
`MyFundedFutrures 50k Builder Max Payout Calculator.xlsx`, whose account is the
app's default template.

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
walkthrough instead of the dashboard. It opens on the default theme and asks
which prop firm you trade with; picking one moves the whole app to that firm's
colors on the spot, and its logo then rides along at the top of every later
screen. Next comes the account type, then its size, then how you want to track
the payout. Type and size are asked separately because they answer different
things: the type carries the rules (consistency, minimum trading days, how
payouts are capped) and the size carries the money (where the balance starts,
the minimum payout, and what a max payout needs). Whichever the firm settles on
its own it fills in — a firm with one type picks it, and a type with one size
skips the size screen entirely. Both firms offer more than one size today, so
both ask.

Accounts whose payouts are graduated, or whose terms changed on a date, then
get one more screen: **where are you in your payout schedule?** It asks how many
payouts you have taken, the buffer you want a payout to leave behind, and where
it matters, whether you bought the account before the firm's cutoff — see
[Payout schedules](#payout-schedules). Accounts
without either (MyFundedFutures Builder, Tradeify 25k Growth) never see it.

**Point-in-time.** Copy four numbers from your account, one per screen:

1. Current balance
2. Largest profit day
3. Cumulative profit since the last payout (it resets after each payout)
4. Trading days since the last payout

**Day-by-day.** Log each trading day instead:

1. Have you taken a payout from this account yet?
2. If yes: your current balance. If not, this screen is skipped and the balance
   is worked out from your logged days.
3. Each day's profit or loss, positive or negative. You can add more later.
   The number of days you log is also your trading days for the firm's
   minimum.

Both paths end on one last question: **Conservative, Aggressive, or Curated?**
Each card previews the plan it would give you for the numbers you just entered.

"Show my plan" on the last screen saves everything and opens the dashboard.
"Change approach" in the dashboard header reopens the walkthrough, prefilled,
and "Keep my current setup" backs out without changing anything.

Storage from before the walkthrough existed (logged days but no setup) skips it
and opens as day-by-day with the balance you'd entered.

### About the balance

Firms count the balance differently, so each template carries its own starting
balance. A MyFundedFutures funded account starts at $0 and counts up from
there; a Tradeify account starts at its size, so a 50k Growth account starts at
$50,000 and pays a max payout at $53,000. Either way the app compares the
balance against the template's balance for a max payout.

Before any payout, the balance isn't asked for: it's the starting balance plus
every day logged since the account was funded, which is how day-by-day works it
out.

## The dashboard

- **Headline and chart:** how many more days at how much each, plotted against
  the daily cap. Logged days are solid columns; planned days are outlined.
- **Day-by-day:** a ledger of each day's P&L, edited inline. An "I've taken a
  payout" switch chooses between an entered and a derived balance.
- **Point-in-time:** "Your numbers" holds your largest profit day, cumulative
  profit, and trading days so far.
- **Account:** the account picker, the payout schedule (how many payouts you
  have taken, which side of the firm's cutoff you bought on, and your payout
  buffer) for accounts that have one, your current balance, and the firm's rules — starting balance,
  balance for max payout, minimum payout, consistency rule, and minimum trading
  days. Changing the payout number or the schedule rewrites the balance a max
  payout needs. These are locked on every visit so a stray keystroke
  can't change them; click the lock icon next to "Account" to edit, and again to
  lock. "Restore defaults" is locked with them and puts the rules back as the
  template sets them, leaving your balance alone.
- **How the target is set:** which rule is driving the profit you need, the
  most the next payout may withdraw, and how many of the firm's trading days
  you have.

Your numbers map to the sheet like this:

| Sheet cell | Point-in-time | Day-by-day |
|------------|---------------|------------|
| `A3` Balance | entered | entered after a payout, else starting balance plus logged days |
| `D3` Largest Profit Day | entered | biggest winning day (0 until you have one) |
| `F3` Current Net Profit | entered | sum of every day, losses included |
| trading days | entered | logged days that clear the firm's profit bar |

Everything is saved in your browser's `localStorage` (`mpc.setup`, which also
holds the payout schedule, plus `mpc.rules`, `mpc.snapshot`, `mpc.days` and
`mpc.theme`). Nothing is sent anywhere.

## Account templates

[`src/lib/accounts.ts`](src/lib/accounts.ts) holds three registries, one per
level of the question:

| Registry | What it carries |
|----------|-----------------|
| `FIRMS` | the firm's name, color theme, and logo |
| `ACCOUNT_PROGRAMS` | an account type, e.g. Builder or Growth, and its cutoff date |
| `ACCOUNT_TEMPLATES` | one size of one type, with its rules and payout schedule |

Picking a size fills in the account settings; the fields stay editable behind
the lock, and "Restore defaults" puts the template's rules back.

| Firm | Type | Size | Starts at | Qualifying balance | Consistency | Minimum days | A day counts over | Minimum payout |
|------|------|------|-----------|--------------------|-------------|--------------|-------------------|----------------|
| MyFundedFutures | Builder | 25k | $0 | — | 50% | 2 | every day | $250 |
| MyFundedFutures | Builder | 50k | $0 | — | 50% | 2 | every day | $500 |
| Tradeify | Growth | 25k | $25,000 | $26,500 | 35% | 5 | $100 | $250 |
| Tradeify | Growth | 50k | $50,000 | $53,000 | 35% | 5 | $150 | $500 |
| Tradeify | Growth | 100k | $100,000 | $104,500 | 35% | 5 | $200 | $1,000 |
| Tradeify | Growth | 150k | $150,000 | $156,500 | 35% | 5 | $250 | $1,500 |

Consistency and minimum days sit on the template rather than the type, so a
firm that varies them by size can say so; the type screen reads them off its
sizes and shows what they share.

### Payout schedules

The balance a max payout needs is not a fixed number for every firm. A
`PayoutSchedule` on each size holds what decides it:

| Field | Meaning |
|-------|---------|
| `caps` | the most one request may withdraw, by payout number; the last entry repeats |
| `minimumPayout` | the smallest request the firm accepts |
| `qualifyingBalance` | the balance a payout request needs at all, 0 where none is published |
| `floor` | what has to remain afterwards |
| `floorBreaches` | whether landing on the floor fails the account, or it is merely withheld |

From those, `payoutThreshold(schedule, payoutsSoFar, buffer)` is

```
max(qualifyingBalance, floor + cap for that payout number + buffer)
```

which is the number written into the dashboard's "Balance for max payout".
The workbook's own account is the simple case: its payout buffer is the floor
($2,100) and its payout cap the one withdrawal cap ($2,000), so they still add
to $4,100 whatever the payout number. Its buffer is withheld rather than a fail
level, so `buffer` does not apply to it.

The Builder 25k is the same rules halved, which is what confirms the shape: its
buffer is $1,100 — the account's $1,000 max loss limit plus $100 — its cap
$1,000, and its minimum payout $250, the profit MyFundedFutures wants above the
buffer. Balance for a max payout: $2,100.

### Drawdown room

A trailing max drawdown is not a buffer you keep — it is the level the account
dies at. Tradeify's own words: your net liquidation value failing "to or below"
the floor is a hard breach with no recovery, and the dashboard figure is "the
exact dollar floor your balance cannot fall to or below". So a payout that
leaves the balance exactly on the floor has already breached it.

No firm publishes a cushion to leave on top — the payout policy only notes, in
its own worked example, how much drawdown room a given payout leaves you. So
the app makes it the trader's number: a **Drawdown room to keep** field beside
the payout schedule, defaulting to `DEFAULT_DRAWDOWN_ROOM` ($100), which is
added on top of floor plus cap wherever `floorBreaches` is set.

In practice it rarely binds, because a firm's qualifying balance usually
leaves more room than that on its own — a 50k Growth taking its first payout
of $1,500 at $53,000 keeps $1,400, which is the figure Tradeify's own scenario
quotes. It binds on the later, bigger caps: that account's fourth payout of
$3,000 needs $53,200, not the $53,100 that would land it on $50,100. The
schedule controls say which it is, in full: "Payout 4 can be up to $3,000,
which needs a balance of $53,200 and leaves $100 of drawdown room."

`drawdownRoomAt(schedule, payoutsSoFar, balance)` is what that sentence reads
from, and returns null where the floor is not a fail level.

**Tradeify Growth is graduated.** The cap rises with the payout number, and
accounts bought before September 12, 2025 at 8:00 AM EST keep an older table:

| Payout | 25k | 50k | 100k | 150k |
|--------|-----|-----|------|------|
| 1 | $1,000 | $1,500 | $2,000 | $2,500 |
| 2 | $1,000 | $2,000 | $2,500 | $3,000 |
| 3 | $1,000 | $2,500 | $3,000 | $4,000 |
| 4+ | $1,000 | $3,000 | $4,000 | $5,000 |

| Payout (bought before the cutoff) | 50k | 100k | 150k |
|--------|-----|------|------|
| 1 | $1,500 | $2,000 | $2,500 |
| 2 | $1,750 | $2,500 | $3,000 |
| 3 | $2,000 | $3,000 | $3,500 |
| 4 | $2,250 | $3,500 | $4,000 |
| 5 | $2,500 | $4,000 | $4,500 |
| 6 | $3,000 | $5,000 | $5,500 |
| 7+ | $25,000 | $25,000 | $25,000 |

Those accounts also qualify at a lower balance: $52,100, $103,600 and $155,100
instead of $53,000, $104,500 and $156,500. The 25k Growth is in neither
before-cutoff table and pays a flat $1,000, so it has one schedule.

The floor is the trailing drawdown once it locks, which is $100 above the
account size. It locks when the end-of-day balance beats the drawdown by $100,
or the moment a payout is requested, whichever comes first — so by payout time
it is always locked. A bigger cap can therefore need more than the published
qualifying balance; see [Drawdown room](#drawdown-room).

`hasSchedule(template)` is what decides whether the app asks at all — true when
the caps graduate or a before-cutoff schedule exists. A firm added later with
either gets the walkthrough screen and the dashboard controls for free.

Sourced from [Builder Plan 25k](https://help.myfundedfutures.com/en/articles/15862870-builder-plan-25k-a-comprehensive-guide),
[Growth Funded: Account Payout
Policy](https://help.tradeify.co/en/articles/11083796-growth-funded-account-payout-policy),
[Growth Evaluation
Accounts](https://help.tradeify.co/en/articles/10495915-growth-evaluation-accounts)
and [Rules: Trailing Max
Drawdowns](https://help.tradeify.co/en/articles/10495897-rules-trailing-max-drawdowns).

The MyFundedFutures 50k Builder is the default and the workbook's own account,
so its numbers are the ones the calculation tests pin. It is no longer the
first entry in the registry, so `accountTemplate` falls back to it by id rather
than by position. Template ids keep the
old `firm-size-type` spelling (`mffu-50k-builder`), so saved setups survive.

To add a size, add an entry to `ACCOUNT_TEMPLATES` with its `programId` and a
payout schedule. To add a type, add it to `ACCOUNT_PROGRAMS` with its `firmId`,
plus a `cutoff` if its sizes carry a before-cutoff schedule. To add a firm, add it to
`FIRMS` with its logo and a `themeId` pointing at a theme in
`src/lib/themes.ts`. The walkthrough's three screens, the dashboard picker, and
the footer's list of firms all follow from the registries.

### Where the logos go

A firm's logo appears wherever its account does — on the walkthrough's firm
cards, at the top of every screen after one is picked (beside the type, then
the full account, as each is settled), and above the account picker in the
dashboard's Account panel. The header never shows it: it names the account in
words instead.

Both SVGs in `src/assets/brands/` are the white-on-dark logos from each firm's
own site header (a comment in each file records the source URL), so
[`FirmLogo`](src/components/FirmLogo.tsx) sets them on a dark plate in light
mode and drops the plate in dark mode, where the art already fits.

### Minimum trading days

Most firms want a number of trading days since the last payout before they will
pay one. The app subtracts the days you have from the firm's minimum and never
plans fewer days than are left, so a plan can run longer than the profit alone
would need. When the profit target is already met but days are missing, the
headline says so ("Three more trading days to qualify").

### Which days count

A day is not always a day. Tradeify only counts one towards the minimum if it
makes **more** than a figure set by account size — $100, $150, $200 and $250
across the Growth sizes — so a small green day, a flat day and a losing day all
count for nothing. MyFundedFutures counts every day traded, which is
`qualifyingDayProfit: 0` and leaves the workbook's behaviour alone.

That figure changes three things:

- **Days behind you.** `summarize(entries, qualifyingProfit)` reports
  `qualifyingDays` alongside `tradingDays`, and day-by-day feeds the former to
  the calculator. The breakdown says which: "Only days over $150 count, so 3 of
  your 6 do." Point-in-time asks for the count that already counts.
- **Days ahead of you.** A planned day only buys eligibility if it clears the
  bar too, so `qualifyingDailyProfit` floors every planned day at one cent over
  it while days are still owed. Where the profit target is already met, those
  days ask for $150.01 rather than nothing — a day of nothing would not be one
  of them.
- **Curated caps.** A cap under the bar can never reach a payout, however many
  days it runs, so the app says that rather than counting to 252: "A day has to
  make more than $150.00 to count towards the 2 trading days Tradeify still
  needs, so a cap below that never gets there."

The bar is "profit greater than", so a day exactly on it does not count —
`dayQualifies(150, 150)` is false — and that is why plans aim a cent above
(`QUALIFYING_STEP`).

Like every other rule it stays editable on the dashboard, as **Profit for a day
to count**.

## The calculations

[`src/lib/calc.ts`](src/lib/calc.ts) is a cell-for-cell port of `Sheet1`:

| Cell | Name | Formula |
|------|------|---------|
| `E3` | Minimum target net profit | `=MAX(minimum payout, threshold - A3)` |
| `H3` | Minimum net profit required | `=MAX(E3, ABS(D3)/G3)` |
| `I3` | Remaining profit needed | `=H3-F3` |
| `J3` | Minimum trading days left | `=CEILING.MATH(I3/(H3*G3))` |
| `K3` | Daily profit needed (equal split) | `=I3/J3` |

The sheet writes `E3` as `=MAX(500, (B3+C3)-A3)`: its $500 is the firm's minimum
payout, and its payout buffer plus payout cap ($2,100 + $2,000) is the $4,100
balance a max payout needs. The app keeps those as two template fields, minimum
payout and balance for max payout, which every firm has in some form.

`H3 × G3` is the **daily cap**: the most one day can contribute without breaking
the consistency rule. Because `H3` is at least `largest day ÷ G3`, your largest
day can never exceed the cap, and `J3` spreads the remaining profit so each
planned day stays under it too. Make a bigger day than the cap and `H3` rises.

[`src/lib/ledger.ts`](src/lib/ledger.ts) turns logged days into `D3` and `F3`,
and dates the planned days on the next weekdays, starting no earlier than today.

### Conservative, aggressive, and curated plans

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

**Curated** lets the trader set the plan one of two ways (`curatedPlan` in
`calc.ts`):

- **Number of days**, from the aggressive count up to 9, the highest count the
  headline spells out. The plan is that many equal days at the smallest amount
  that still pays out. Once some day count can pay out, every larger one can,
  so every option offered is valid. In the example above, 4 days is $525 a day
  and 9 days is $227.78.
- **Daily cap**, which replaces the default and largest-day cap. The plan is the
  fewest days whose equal daily amount stays at or under it: a $700 cap gives
  4 days of $525. At the conservative cap this is exactly the conservative
  plan. A cap that would take more than 252 trading days (a year) is turned
  away.

### Deliberate differences from the spreadsheet

The sheet leaves three situations as raw Excel errors. The app handles them
instead, and the tests pin each one:

1. **Target already met** (`I3 <= 0`). The sheet gives `K3 = #DIV/0!`. The app
   shows "Payout ready", or the trading days still to go.
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
  search confirms no daily amount gets there a day sooner. Across the same
  sweep, curated reproduces conservative at the conservative cap, and every
  day count from the fastest up pays out without asking for more per day.
  Minimum trading days are covered too: plans stretch to the firm's minimum,
  every planned day clears the profit bar that makes it count, and a cap under
  that bar is turned down.
- `src/lib/ledger.test.ts`: largest day and net profit from daily entries,
  which days clear a firm's profit bar (and that one exactly level with it does
  not), pasted formatting like `$1,200`, and weekend-aware plan dates.
- `src/lib/accounts.test.ts`: every template's rules, the split of an account
  into its size and type, the published payout tables (both Tradeify schedules,
  the caps that repeat, and the thresholds they imply), that each size belongs
  to a registered type and each firm to a theme and a logo, and that the app's
  default is the workbook's account.
- `src/lib/setup.test.ts`: which walkthrough screens each path shows, including
  dropping the size screen for a single-size type and the schedule screen for
  an account without one, how each template derives the balance and counts only
  the logged days that clear its bar, and detecting storage from before the
  walkthrough.
- `src/App.test.tsx`: mounts the app in jsdom and walks both walkthrough paths
  to the workbook's `$355.70` a day, covers picking a firm (the theme follows
  at once), then a type and a size (their rules follow), the size screen
  offering only that type's sizes and being skipped when there is only one,
  the payout schedule screen (the cap, balance and room left for a later
  payout, the warning a cut buffer earns, and an account bought before the
  cutoff) and its absence on a flat schedule,
  the no-payout path's derived balance, validation, reopening and cancelling,
  and both dashboards' editing, removing, invalid input, eligibility, and
  payout-ready states.

## Color themes

The palette is a swappable theme, picked from the palette icon in the header
and saved in the browser (`mpc.brand`). It applies to the whole app, walkthrough
included.

| Theme | Modes | Source |
|-------|-------|--------|
| Default | light and dark | the app's own palette |
| MyFundedFutures | dark only | colors and typeface (Lexend) from myfundedfutures.com |
| Tradeify | dark only | colors and typeface (Mona Sans) from tradeify.co |

Picking a firm in the walkthrough switches to its theme, as does switching
accounts on the dashboard. Themes carry no logos of their own — a logo belongs
to the firm, in `FIRMS`, and shows next to the account whichever theme is on.
The footer says the app isn't affiliated with or endorsed by those firms; that
list is built from `FIRMS`, so a new one joins it automatically.

A dark-only theme hides the light/dark toggle; the trader's light/dark
preference is kept and comes back with a theme that has both.

Themes are meant to follow the trader's prop firm later on. To add one:

1. In `src/index.css`, add its tokens under `:root[data-brand='<id>']`, and
   under `:root[data-brand='<id>'].dark` too if it has both modes. Give every
   token the default theme sets a value, including the chart roles
   `--profit`, `--loss`, `--plan`, `--grid`, and `--axis`. To use the firm's
   typeface, also set `--font-sans` and import the font at the top of the
   file (fonts only download for the theme that uses them).
2. Register it in `src/lib/themes.ts` with its name, modes, and three picker
   swatches. A firm's theme is then pointed at by its `themeId` in
   [`src/lib/accounts.ts`](src/lib/accounts.ts).
3. Check the chart's profit, loss, and plan colors against the theme's card
   color: at least 3:1 contrast each, and far enough apart to tell under
   color blindness. The chart also separates profit and loss by direction,
   but color should hold up on its own.

## Link previews

Pasting the site's link into a chat app shows `public/og-image.png`
(1200×630), set by the Open Graph tags in `index.html`.

The image URL is built from the deployed address in `.env`:

```bash
VITE_SITE_URL=https://max-payout-calculator.netlify.app
```

Many apps, including WhatsApp, Facebook, and LinkedIn, only load the image from
a full URL, so update this if the site moves, then rebuild. Apps cache
previews, so after changing the image, re-scrape the link in the platform's
debugger (for example Facebook's Sharing Debugger) to see the update.

## Node version

The installed Node is 20.11.0, which pins a few tools below their latest
versions:

| Tool | Pinned | Latest needs |
|------|--------|--------------|
| Vite | 6 | Vite 7 needs `^20.19.0 \|\| >=22.12.0` |
| shadcn CLI | 3.8.5 | 4.x needs `>=20.18.1` |
| jsdom | 25 | 26+ needs `require(esm)` support |

Upgrading to Node 22 LTS lifts all three.
