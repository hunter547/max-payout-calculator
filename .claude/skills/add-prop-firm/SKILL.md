---
name: add-prop-firm
description: Add a prop firm to the Max Payout Calculator — its theme and font, its logo and icon as SVGs, and its accounts and payout rules taken from the firm's own help center. Use when asked to add, update, or re-check a firm (MyFundedFutures, Tradeify, Topstep, Lucid Trading, Apex Trader Funding, or a new one).
---

# Adding a prop firm

A firm arrives in two halves, and they can land in either order or weeks apart:
its **look** (theme, font, logo, icon) and its **accounts** (programs, sizes,
payout rules). A theme may ship before any account does — the theme picker
offers it and the footer names it from the moment it exists.

Work the halves in the order the user asks for. Each numbered step below ends
with something committed and pushed.

## Ground rules

- **Every number comes from the firm's own current pages, fetched in this
  session.** Never from memory, never from a third-party summary. These firms
  change rules often and quietly.
- **A firm's help center can be out of date about its own products.** Apex's
  help center said legacy accounts were retired while `/legacy-products` was
  selling them. When a rules page and a sales page disagree, fetch both, follow
  the sales page for *what exists* and the help center for *how it behaves*,
  and say in the commit or the reply which won.
- **Say what you could not find.** If a figure is not published, leave it out
  and flag it rather than inferring it. Apex publishes no legacy profit targets
  in its help center; they turned up on the sales page only.
- Firm names, rules and logos belong to the firms. The app is not affiliated
  with any of them, which the footer says automatically once a theme or firm is
  registered.

## 1. Colors and fonts

Fetch the site and read its own tokens rather than eyedropping screenshots:

```bash
curl -s -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
  (KHTML, like Gecko) Chrome/131.0 Safari/537.36" https://firm.example -o firm.html
grep -oE '\-\-[a-z-]*color[a-z-]*: *#[0-9a-fA-F]{3,8}' firm.html | sort -u
grep -oiE 'https?://[^"]*\.woff2?' firm.html | sort -u
grep -oiE 'font-family:[^;"]*' firm.html | sort -u
```

**The font.** Firms usually license their display face (Benton Sans, Guardian
Sans, Transducer). Do not ship their font files. Pick the closest free face on
`@fontsource-variable/*`, and **prefer one with a width axis** — the app's
`font-display`, `font-expanded` and `font-figure` utilities set `font-stretch`,
and a face without the axis silently falls back to normal width. Check the
package's CSS entry points before choosing: Roboto Flex has a width axis only
in its 326 KB `full.css`, where Saira's `wdth.css` is 99 KB. If the firm's own
stack lists a free face (Apex lists Saira), that is both the closest match and
the honest one.

**The palette.** Add a block to `src/index.css` keyed on `data-brand`, copying
the shape of the block above it, and an entry in `BRAND_THEMES`
(`src/lib/themes.ts`) with `schemes: ['dark']`, three swatches and
`firm: true`. Firm themes are dark-only so far.

Two things trip people here:

- **A brand color is not always usable as a chart bar.** Apex's cobalt
  `#0026ff` is 2.4:1 against its own navy page — fine behind white button text,
  unreadable as a filled bar or a focus ring. Keep the validated chart trio
  (`--profit #2daa80`, `--loss #d2463c`, `--plan #4f7bf0`) and give the brand
  color `--primary`; let the firm's second color take `--cap`.
- **Check the trio on the new theme's own plate**, with the `dataviz` skill's
  palette checker — the trio is validated, the surface under it is not:

  ```bash
  node validate_palette.js "#2daa80,#d2463c,#4f7bf0"     --mode dark --surface "#0b1138" --pairs all
  ```

  A firm's second colour will usually fail the lightness band (Apex's gold sits
  at L 0.81, above the dark band's 0.67). That is expected and fine *as a
  labelled line* — every firm theme uses it for the cap line only, never for a
  filled bar. Write the result into the theme's CSS comment.
- **Write the reasoning into the CSS comment.** Every existing theme block
  explains which brand color went where and why, and the next person will trust
  it over re-deriving it.

## 2. Logo and icon as SVGs

Both live in `src/assets/brands/`: `firm.svg` (the lockup, white-on-dark, as
`FirmLogo` draws it) and `firm-icon.svg` (the square mark, as `FirmIcon` draws
it in the account switcher). Register both on the firm in `FIRMS`.

**Prefer the firm's own vector.** Check `<head>` for an SVG logo and the icon
links (`rel="icon"`, `apple-touch-icon`) for the largest size they publish —
often 512px. Apex serves `apex-logo-light.svg` outright.

**Build the icon out of the lockup where you can.** Three of the five icons are
not traced at all: Tradeify's `tdfy` reuses the `t`, `d` and `f`-`y` outlines
from `tradeify.svg`, MyFundedFutures' shield is lifted whole from `mffu.svg`,
and Apex's mark comes out of `apex.svg`. Then place it the way the firm's own
favicon places it — measure the favicon rather than eyeballing:

```python
# ink extent and centre, as a share of the square
a = np.asarray(Image.open('favicon.png').convert('RGBA'), np.float32)
ys, xs = np.where(a[..., 3] > 20)   # or a luminance threshold on a solid ground
```

**Only trace when there is no vector.** The pipeline that produced `topstep.svg`
and `lucid.svg`:

1. Alpha channel → 4× bicubic upscale → threshold. Supersampling recovers
   sub-pixel edge positions and roughly halves the error.
2. `potrace` (the `potrace` npm package) with `turdSize` 2–20, `alphaMax` 1,
   `optTolerance` 0.2.
3. Refit. Potrace returns straight stems as curves; a corner-split + line/cubic
   fitter with Newton reparameterisation cuts the file by 3–4× and makes stems
   exactly upright. Two gotchas cost an hour each: **densify potrace's `L`
   commands too** (a long edge arrives as two points and the fit bows it), and
   **estimate end tangents with a second-order one-sided difference** (a plain
   chord leans into the curve and tilts the control points).
4. `npx svgo file.svg -o out.svg --precision=2`.
5. Grade it: render back at source size with Inkscape and compare coverage
   against the original, and compare again at the sizes the app actually draws
   (14–45px). Mean error under ~0.2/255 with no pixel over 128 is indistinguishable.

A photoreal mark (Lucid's sphere) cannot be traced — rebuild it from gradients
fitted to the firm's render, and **say in the file's comment that it is a
re-creation, not a trace.**

**Check every SVG parses before believing a render.** Inkscape tolerates
malformed XML that browsers reject outright:

```bash
for f in src/assets/brands/*.svg; do
  python -c "import xml.dom.minidom,sys; xml.dom.minidom.parse('$f')" || echo "BROKEN $f"
done
```

A `--` inside an XML comment is illegal and blanks the whole file in a browser.
This shipped twice before being caught in the browser, not by the tests.

## 3. Research the accounts

Crawl the firm's help center, not its marketing pages, for rules. Help centers
sit behind Cloudflare more often than not, so drive a real browser with a fresh
profile — which also guarantees nothing is served from cache:

```js
const browser = await chromium.launch({
  channel: 'msedge', headless: false,
  args: ['--disable-blink-features=AutomationControlled', '--disable-application-cache'],
})
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'Cache-Control': 'no-cache, no-store, max-age=0', Pragma: 'no-cache' },
})
```

Walk the category index, then every article under it, saving `document.body
.innerText` per page with its URL and fetch time. Read the payout articles in
full; they carry the tables.

For each program, write down: **sizes, starting balance, drawdown, consistency
rule, minimum trading days, what makes a day count, minimum payout, the
qualifying/minimum balance, the max payout per payout number, and what happens
when the payouts run out.** Note the wording, not just the number — "more than
$150" and "$100 or more" are different rules and the app models both.

**Only accounts with a consistency rule or a payout schedule belong in the
app.** LucidFlex and LucidDaily were left out for having neither.

## 4. Fit it to the model, and extend the model if it does not fit

The registry is three layers in `src/lib/accounts.ts`: `FIRMS` →
`ACCOUNT_PROGRAMS` (a type, e.g. "Growth", "EOD Drawdown") → `ACCOUNT_TEMPLATES`
(one size, with a `PayoutSchedule`). Read `PayoutSchedule`'s own comments first;
most firms already fit.

What each firm needed that nothing before it did, as a guide to how far the
model bends:

| Firm | New shape | Field |
|------|-----------|-------|
| Tradeify | terms that changed on a date | `variant` + `alt` schedule |
| Tradeify | a bar a day must beat to count | `qualifyingDayProfit` |
| Topstep | a payout capped at a share of balance | `withdrawShare` |
| Lucid | profit goal per cycle, no balance gate | `goals` |
| Apex | a floor that lapses partway through | `floors`, `floorBreachesFrom` |
| Apex | a payout the firm stops capping | `Infinity` in `caps` |
| Apex | two day counts at once | `minQualifyingDays` |
| Apex | a bar worded "or more" | `qualifyingDayInclusive` |
| Apex | the account closes after N payouts | `maxPayouts` |

When you do extend it:

- Put the firm's own wording in the field's doc comment — that is what makes
  the next reader able to check it.
- A firm fact the trader cannot edit (how a bar is worded, how many payouts an
  account gets) lives on the **template**, not in the editable rules record.
  Thread it through `deriveInputs`' last argument, not through `AccountKey`.
- Copy follows the model. A rule worded differently needs its sentence
  everywhere it appears: the walkthrough step, `SnapshotPanel`,
  `TargetBreakdown`, the verdict and the curated-cap note. Centralise the
  phrase in `src/lib/format.ts` (see `qualifyingBar`) rather than branching in
  five components.
- A terminal state needs to end the whole page, not just the headline. When
  Apex's account runs out of payouts the plan toggle and the chart come off
  too, and the "Your numbers" lead stops promising a plan.

## 5. Run the suite before adding anything to it

`npx vitest run`. Expect these to break on a firm that bends the model, and
read each one before touching it — two of the three were invariants that were
true only for the firms that existed when they were written:

- the footer's not-affiliated line and the theme picker's list (add the name);
- `deriveInputs`' exact-shape assertion (new input keys);
- registry invariants such as "the floor is the starting balance plus $100",
  which held until Apex withheld a safety net instead. **Scope the invariant to
  the firms it describes; never loosen it to nothing.**

A regression here is the real risk: the same helpers serve every firm.

## 6. Add the firm's own tests

In `src/lib/accounts.test.ts`, pin the firm's **published tables**, not the
numbers you happened to compute:

- one test per program listing size, drawdown, consistency, days, bar and the
  firm's published minimum balance, asserting `payoutThreshold` reproduces it;
- the max-payout table by payout number, including where two programs differ;
- any new shape end to end (the floor before and after it lapses, the uncapped
  payout, the count that ends the account).

Where a firm publishes a derived figure — Lucid's "minimum balance for maximum
payout", Apex's "minimum balance to request" — assert the app derives exactly
that. It is the strongest check that the model matched the firm's intent.

New model behaviour also wants unit tests next to it: `dayQualifies` in
`src/lib/ledger.test.ts`, day counts in `src/lib/calc.test.ts`.

## 7. Verify in a browser, then document and push

Tests do not catch a broken SVG, an unreadable bar on a dark ground, or a plan
that renders under a headline saying there is nothing to plan. Build, preview,
and walk a real account through the walkthrough with Playwright + Edge
(`npx vite preview --port 4173`), checking the console is clean. Compare the
plan's numbers against the firm's rules by hand at least once per program.

Then:

- **The link preview card.** `public/og-image.png` shows every firm's icon and
  names how many there are, so a new firm makes it stale. Regenerate it from
  [`tools/og-card/`](../../../tools/og-card/README.md).
- **README.** Add the account rows to the table in "Account templates", the
  theme row in "Themes", and a paragraph on any rule shape that is new. Say
  what you deliberately did not model and why (Apex's tiered payout split is
  take-home, not request size, so the app does not track it).
- **Ambiguities.** Where the firm's docs do not settle something, write the
  assumption into the code comment *and* the README, and choose the direction
  that cannot hurt the trader — ask for more balance, not less.
- **Commit** in one or two sentences, no trailers, and push.

## The files a firm touches

```
src/index.css                      theme block, font import
src/lib/themes.ts                  BRAND_THEMES entry
src/assets/brands/firm.svg         lockup
src/assets/brands/firm-icon.svg    square mark
src/lib/accounts.ts                FIRMS, ACCOUNT_PROGRAMS, ACCOUNT_TEMPLATES
src/lib/accounts.test.ts           the firm's published tables
public/og-image.png                the card, regenerated from tools/og-card/
README.md                          account rows, theme row, new rule shapes
```

Plus, only where the model had to bend: `src/lib/calc.ts`, `src/lib/ledger.ts`,
`src/lib/setup.ts`, `src/lib/format.ts`, and the components that word the rule.
