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

A firm with no minimum trading days skips that question later on, the way a
single-size type skips its own.

Every account then says where it is in its payouts, in one of two ways:

- Accounts whose payouts are graduated, or whose terms changed on a date, get
  **where are you in your payout schedule?** — how many payouts you have taken,
  the buffer you want one to leave behind, and where it matters, which side of
  the firm's cutoff you bought on. See [Payout schedules](#payout-schedules).
- The rest get **have you taken a payout from this account yet?**

It is asked before the approach question, so both cards on that screen can say
exactly what they will need.

**Point-in-time.** Copy a few numbers from your account, one per screen:

1. Current balance, *only* once a payout has been taken (see
   [The balance](#about-the-balance))
2. Largest profit day
3. Cumulative profit since the last payout (it resets after each payout)
4. Trading days since the last payout, where the firm's minimum can bind (see
   [Days a consistency rule already takes](#days-a-consistency-rule-already-takes))

**Day-by-day.** Log each trading day instead:

1. Current balance, on the same condition as above.
2. Each day's profit or loss, positive or negative. You can add more later.
   The days you log are also your trading days for the firm's minimum.

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

**Before the first payout the balance is not asked for at all**, in either
approach: it is the starting balance plus the profit since, which the trader
has already given — as logged days in one approach and as cumulative profit in
the other. On an account that starts at $0, like a Builder, the balance and the
cumulative profit are the same number, so asking for both would be asking twice
and inviting two answers that disagree.

Once a payout has been taken the two part company — a payout takes money out of
the balance while the profit count resets to zero — so from then on both are
asked for, and the balance is typed rather than worked out.

## The dashboard

- **Headline and chart:** how many more days at how much each, plotted against
  the daily cap. Logged days are solid columns; planned days are outlined.
- **Day-by-day:** a ledger of each day's P&L, edited inline. An "I've taken a
  payout" switch chooses between an entered and a derived balance, on accounts
  whose payouts are not already counted by a schedule.
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

Everything is saved in your browser's `localStorage` — `mpc.accounts` holds
every account (its setup, rules, numbers and logged days), `mpc.current` says
which one is open, and `mpc.theme` and `mpc.brand` are the appearance. Nothing
is sent anywhere.

## Several accounts

Traders run more than one account, so the app keeps a list of them
([`src/lib/portfolio.ts`](src/lib/portfolio.ts)) and shows one at a time. The
account name in the header is a switcher: it lists what you have with each
firm's logo, and adds, renames or removes one.

Everything else is per account — its template and rules, its ledger or numbers,
its payout schedule and its payouts taken — so two Tradeify 50k Growths sit
side by side without touching each other. Switching carries the app to that
account's firm colors, and the theme picker still overrides until you switch
again.

**Nothing has to be named.** An account is called what it is —
"Tradeify 50k Growth" — and only when you hold two of the same does it become
"#1" and "#2". A nickname replaces that, and stops the numbering; name one of
a pair and the other goes back to its plain name.

The one account the app used to hold moves across on first load, keeping its
rules and its ledger, and the old keys are left where they are rather than
deleted. `loadAccounts` does that, and covers storage from before the
walkthrough existed too.

## Taking a payout

Once the dashboard says **Payout ready** there is nothing left to plan, so it
offers the one thing left to do: a **Payout taken** button under the headline,
which opens a short sequence of its own
([`PayoutFlow.tsx`](src/components/PayoutFlow.tsx)).

1. **Congratulations on taking a payout!** — with confetti, and a field for what
   you withdrew. It starts at the most this payout allows and will not take
   more, or less than the firm's minimum.
2. **Does this look correct?** — the balance before, the payout, and the balance
   the next cycle starts from, plus what is about to be cleared.
3. **Have you made any profit since taking the payout?**
4. If so, **log each trading day** (or, point-in-time, the numbers since).

Finishing it takes the payout off the balance, clears the days and profit behind
it, and counts the payout — which on a graduated schedule moves the cap, the
target and the consistency rule to the next payout's own terms. "Not yet, go
back" leaves everything as it was.

`maxPayoutFor(schedule, payoutsSoFar, balance)` is what the first screen caps
at: the firm's cap, whatever share of the balance it allows, and never more
than the balance has above its floor.

The confetti is [canvas-confetti](https://www.npmjs.com/package/canvas-confetti)
in the theme's own colors, imported on demand so it stays out of the main
bundle, and skipped for anyone whose system asks for reduced motion.

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
| Tradeify | Lightning | 25k | $25,000 | — | 20% → 30% | none | — | $1,000 |
| Tradeify | Lightning | 50k | $50,000 | — | 20% → 30% | none | — | $1,000 |
| Tradeify | Lightning | 100k | $100,000 | — | 20% → 30% | none | — | $1,000 |
| Tradeify | Lightning | 150k | $150,000 | — | 20% → 30% | none | — | $1,000 |
| Topstep | XFA Consistency | 50k | $0 | — | 40% | 3 | every day | $125 |
| Topstep | XFA Consistency | 100k | $0 | — | 40% | 3 | every day | $125 |
| Topstep | XFA Consistency | 150k | $0 | — | 40% | 3 | every day | $125 |
| Lucid Trading | Pro | 25k | $25,000 | — | 40% | none | every day | $500 |
| Lucid Trading | Pro | 50k | $50,000 | — | 40% | none | every day | $500 |
| Lucid Trading | Pro | 100k | $100,000 | — | 40% | none | every day | $500 |
| Lucid Trading | Pro | 150k | $150,000 | — | 40% | none | every day | $500 |
| Lucid Trading | Direct | 25k | $25,000 | none | 20% | none | every day | $500 |
| Lucid Trading | Direct | 50k | $50,000 | none | 20% | none | every day | $500 |
| Lucid Trading | Direct | 100k | $100,000 | none | 20% | none | every day | $500 |
| Lucid Trading | Direct | 150k | $150,000 | none | 20% | none | every day | $500 |

Lightning has no qualifying balance because it gates on profit earned rather
than balance reached — see [Profit goals](#profit-goals) — and its consistency
rule tightens with each payout. Topstep's Express Funded Account counts profit
up from zero like a Builder, and caps a request at half the balance — see
[A share of the balance](#a-share-of-the-balance). Its three trading days are
what a 40% consistency rule takes anyway, so they never bind.

LucidDirect gates on profit alone — see [No balance to
reach](#no-balance-to-reach) — at a tighter 20% and with a goal that falls after
the first payout while the cap rises after the third.

LucidPro gates on both at once: a profit goal between cycles ($250 to $1,000 by
size) and a balance above its buffer. The buffer is the account's max loss
limit plus $100 and a payout may not come out of it, so the balance a max
payout needs is buffer plus cap — which reproduces the firm's own published
"minimum balance for maximum payout" exactly, on all four sizes and both
payout numbers. A test pins that table.

Consistency and minimum days sit on the template rather than the type, so a
firm that varies them by size can say so; the type screen reads them off its
sizes and shows what they share.

### Payout schedules

The balance a max payout needs is not a fixed number for every firm. A
`PayoutSchedule` on each size holds what decides it:

| Field | Meaning |
|-------|---------|
| `caps` | the most one request may withdraw, by payout number; the last entry repeats |
| `goals` | profit to earn since the last payout before one unlocks, by payout number |
| `consistencies` | the consistency rule by payout number, where a firm raises it |
| `minimumPayout` | the smallest request the firm accepts |
| `qualifyingBalance` | the balance a payout request needs at all, 0 where none is published |
| `withdrawShare` | the share of the balance one request may take, where a firm caps it that way |
| `floor` | what has to remain afterwards |
| `floorBreaches` | whether landing on the floor fails the account, or it is merely withheld |

From those, `payoutThreshold(schedule, payoutsSoFar, buffer)` is

```
max(qualifyingBalance, floor + cap + buffer, cap / withdrawShare)
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
accounts bought before September 12, 2025 at 8:00 AM EST are on a second set of
terms with an older table:

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
anything graduates (caps, goals or consistency rules) or a before-cutoff
schedule exists. A firm added later with
either gets the walkthrough screen and the dashboard controls for free.

Sourced from [Builder Plan 25k](https://help.myfundedfutures.com/en/articles/15862870-builder-plan-25k-a-comprehensive-guide),
[LucidPro
Payouts](https://support.lucidtrading.com/en/articles/12890092-lucidpro-payouts),
[LucidDirect Payout
Objectives](https://support.lucidtrading.com/en/articles/12890164-luciddirect-payout-objectives),
[Topstep Payout
Policy](https://help.topstep.com/en/articles/8284233-topstep-payout-policy),
[Lightning Funded: Account Payout
Policy](https://help.tradeify.co/en/articles/10495932-lightning-funded-account-payout-policy),
[Lightning Funded
Accounts](https://help.tradeify.co/en/articles/10495938-lightning-funded-accounts),
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

The logos in `src/assets/brands/` are the white-on-dark art from each firm's
own site header — SVG where the firm publishes one, and a webp where it has
none (Topstep, Lucid Trading). A logo may set `scale` where its lockup is squat
rather than a long wordmark, so it reads at the same row height; Lucid's is
174×90 and wants about 1.6. They sit there unused until a firm is registered,
so
[`FirmLogo`](src/components/FirmLogo.tsx) sets them on a dark plate in light
mode and drops the plate in dark mode, where the art already fits.

### Minimum trading days

Most firms want a number of trading days since the last payout before they will
pay one. The app subtracts the days you have from the firm's minimum and never
plans fewer days than are left, so a plan can run longer than the profit alone
would need. When the profit target is already met but days are missing, the
headline says so ("Three more trading days to qualify").

### Days a consistency rule already takes

A firm's minimum trading days is not always worth asking about. At payout time
no single day may top `consistency` of the net profit, and the net is at most
the day count times the largest day, so **the count is already at least
1 / consistency**:

| Account | Consistency | Days it forces | Firm asks | Binds? |
|---------|-------------|----------------|-----------|--------|
| MyFundedFutures Builder | 50% | 2 | 2 | no |
| Tradeify Growth | 35% | 3 | 5 | yes |
| Tradeify Lightning | 20–30% | 4–5 | none | no |

So a Builder's two days arrive on their own, and `tradingDaysBind` returns
false: the question is dropped from the walkthrough, the field from the
dashboard, and the row from the breakdown, and the minimum counts as met. Edit
the rule to something that can bind — nine days at 50%, say — and all three
come back.

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
| `E3` | Minimum target net profit | `=MAX(minimum payout, profit goal, F3 + (threshold - A3))` |
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

The sheet leaves three situations as raw Excel errors, and states `E3` in a way
that only works when the balance is already past the threshold. The app handles
all four, and the tests pin each one:

1. **Target already met** (`I3 <= 0`). The sheet gives `K3 = #DIV/0!`. The app
   shows "Payout ready", or the trading days still to go.
2. **Zero consistency rule** (`G3 = 0`). `ABS(D3)/G3` is `#DIV/0!` in Excel. The
   app flags the field and falls back to the minimum target.
3. **Floating-point dust in `CEILING.MATH`.** Excel evaluates at 15 significant
   digits; IEEE 754 doesn't, so a ratio of exactly `2` can land on
   `2.0000000000000004` and round up to `3`. The port settles the ratio to 12
   significant digits first.
4. **The balance shortfall counted twice.** The sheet writes `E3` as
   `MAX(500, (B3+C3)-A3)` — a *shortfall* — but `I3 = H3 - F3` then takes the
   profit already made off it, and the balance in `A3` already counts that
   profit. Subtracting it twice leaves a plan that stops short of the balance
   it was aiming at. The sheet never showed it, because its own row sat above
   the threshold and the $500 floor took over.

   It shows plainly on an account whose balance starts at $0. A Topstep 50k
   with a Daily Loss Limit needs $12,000; one day of $2,269.32 in, the sheet's
   `E3` asks for $9,730.68 of profit, so the plan lands on $9,730.68 — still
   $2,269.32 short. The app adds the shortfall to the profit already made, so
   `E3` is the $12,000 it actually has to reach, and three days of $3,243.56
   land on it exactly.

   `pays()` in the tests is written from the payout's own terms — the balance
   reaches the threshold, the profit clears the minimum and any goal, the
   consistency rule holds — rather than from `E3`, so it can catch this rather
   than restate it.

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

- `src/lib/calc.test.ts`: a profit goal takes over from the balance shortfall
  where it is larger, and leaves accounts without one untouched. The port
  reproduces every cached formula result in
  the workbook (`E3=500`, `H3=718`, `I3=711.4`, `J3=2`, `K3=355.7`) from its
  saved inputs, plus the branch and edge cases above. The aggressive plan is
  checked across a sweep of balances, drawdowns, largest days, and consistency
  rules: it always pays out, is never slower than conservative, and a brute-force
  search confirms no daily amount gets there a day sooner. Across the same
  sweep, curated reproduces conservative at the conservative cap, and every
  day count from the fastest up pays out without asking for more per day.
  A sweep over balances, thresholds, largest days and consistency rules
  checks that every plan lands on the balance it named.
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
  the payout flow (what a payout may be, the balance it leaves, the cycle it
  clears, the days logged after it, and backing out of it),
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
| Topstep | dark only | colors and typeface (Work Sans) from topstep.com |
| Lucid Trading | dark only | colors and typeface (Inter) from lucidtrading.com |

Picking a firm in the walkthrough switches to its theme, as does switching
accounts on the dashboard. Themes carry no logos of their own — a logo belongs
to the firm, in `FIRMS`, and shows next to the account whichever theme is on.

A theme can arrive before its accounts do, as Lucid Trading's did: it is
offered in the theme picker from the moment it exists, and everywhere else once
the firm is registered. Themes taken from a firm's own site are marked `firm: true`, and
the footer's not-affiliated line is built from those plus `FIRMS`, so a firm is
named from the moment the app wears its colors.

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
   swatches, plus `firm: true` where the colors are a real firm's. A firm's
   theme is then pointed at by its `themeId` in
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
