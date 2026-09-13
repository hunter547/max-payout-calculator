# The link preview card

`og.html` is the source of [`public/og-image.png`](../../public/og-image.png),
the card chat apps and search results show for the site. It pulls the firm
icons straight out of `src/assets/brands/`, the app's favicon out of `public/`,
and Archivo out of `node_modules`, so the card cannot drift from what ships —
but it does go stale: **it names five firms and shows five icons, so adding a
sixth means regenerating it.**

To regenerate, render the page at exactly 1200×630 and save over
`public/og-image.png`. At 2× and downsampled, the type stays crisp:

```js
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto('file:///absolute/path/to/tools/og-card/og.html')
await page.waitForTimeout(900)          // let the font land
await page.screenshot({ path: 'og-2x.png' })
```

```python
from PIL import Image
Image.open('og-2x.png').resize((1200, 630), Image.LANCZOS) \
    .convert('RGB').save('public/og-image.png', optimize=True)
```

Two things worth keeping:

- **Every icon sits on the same tile, and the tile is sheet white.** Three of
  them carry their own ground and cover it; MyFundedFutures' shield and Lucid's
  sphere are bare art and would otherwise float on the page. A dark plate works
  too and is what the app uses in light mode, but on this card it turns the row
  into five dark squares — the white one keeps it light.
- **Leave it full colour.** Quantising to 256 colours takes the file from
  ~180 KB to ~65 KB but dithers visibly across Lucid's sphere and Apex's
  gradient, which is the part of the card that looks most like a product.

Check the result at 300px wide as well as full size: that is roughly how it
appears in a chat app, and it is where small type disappears.
