# Demo images

Screens of the app, for sharing. The numbered files are framed cards with a
caption; `raw/` holds the same screens on their own, if you would rather crop
or caption them yourself.

| Card | Size | What it shows |
|------|------|----------------|
| `01-the-plan` | 1600×900 | The answer: days left and the daily number, on an Apex 100k EOD |
| `02-payout-ready` | 1600×900 | "Payout ready" on a Tradeify 50k Growth, with the button that starts the payout flow |
| `03-five-firms` | 1600×900 | The firm picker, with every program and size each firm brings |
| `04-on-phone` | 1080×1080 | The dashboard at phone width, MyFundedFutures |
| `05-by-payout-number` | 1600×900 | The schedule step: cap, consistency and balance for *this* payout |
| `06-several-accounts` | 1600×900 | The switcher, three accounts across three firms |
| `07-log-the-day` | 1600×900 | The ledger and the editable rules beside it, Lucid Trading |
| `08-your-pace` | 1600×900 | Curated plans: pick the days, it finds the number |
| `09-take-it` | 1080×1080 | The payout flow, after taking one |

Square cards suit feeds; the 1600×900 ones suit link previews and posts.

**Every figure on them is real.** Each screen is driven through the actual
walkthrough in a browser — firm, program, size, logged days — so the plans,
caps and balances are what the app computes, not mocked text. That also means
they go stale: a rule change, a new firm or a copy change makes them wrong
rather than merely dated.

To regenerate:

```bash
npm run build && npx vite preview --port 4173
node tools/demo-shots/capture.mjs    # the app's screens -> out/
node tools/demo-shots/compose.mjs    # framed cards      -> out/cards/
```

Then copy `out/cards/*` here and downsample to the size in each filename (they
are rendered at 2×). Both scripts need `playwright-core` and a local Edge or
Chrome; `out/` is ignored by git.

The firms' names and marks belong to them. The cards carry the app's own
not-affiliated line where there is room for it, as the app's footer does.
