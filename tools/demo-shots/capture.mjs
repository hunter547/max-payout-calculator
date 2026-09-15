/**
 * The app's own screens, captured for the demo folder. Every one is driven
 * through the real walkthrough, so the figures on them are what the app
 * works out — nothing here is mocked or typed in by hand.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/demo-shots/capture.mjs
 *
 * Needs playwright-core and a local Edge or Chrome.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

// Raw captures land here; compose.mjs turns some of them into the cards.
const OUT = new URL('./out/', import.meta.url).pathname.replace(/^\//, '')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge' })
const errors = []

async function session({
  width = 1440,
  height = 960,
  scale = 2,
  dark = false,
  // Everything is captured still, so nothing is caught mid-transition — but
  // the confetti bows out entirely under reduced motion, so the payout screen
  // has to ask for it.
  motion = false,
} = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    reducedMotion: motion ? 'no-preference' : 'reduce',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.addInitScript((wantsDark) => {
    localStorage.clear()
    // The app reads this before first paint, so the theme never flashes.
    if (wantsDark) {
      // mpc.appearance is the copy the page reads before first paint; the app
      // itself keeps the brand and the scheme in their own keys.
      localStorage.setItem('mpc.brand', JSON.stringify('default'))
      localStorage.setItem('mpc.theme', JSON.stringify('dark'))
      localStorage.setItem(
        'mpc.appearance',
        JSON.stringify({ brand: 'default', scheme: 'dark' }),
      )
    }
  }, dark)
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  // Hide the caret and any scrollbar so nothing looks like a half-finished form.
  await page.addStyleTag({
    content: `* { caret-color: transparent !important; }
              ::-webkit-scrollbar { width: 0; height: 0; }`,
  })
  return { ctx, page }
}

const next = async (page) => {
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForTimeout(260)
}
const pick = async (page, value) => {
  await page.locator(`button[role="radio"][value="${value}"]`).click()
  await page.waitForTimeout(160)
}
const fill = async (page, selector, value) => {
  await page.locator(selector).fill(value)
  await page.waitForTimeout(120)
}

/** Walk to the plan, logging days along the way. */
async function toPlan(page, { firm, program, size, payouts = 0, days, strategy = 'conservative' }) {
  await pick(page, firm)
  await next(page)
  await pick(page, program)
  await next(page)
  if (await page.locator(`button[role="radio"][value="${size}"]`).count()) {
    await pick(page, size)
    await next(page)
  }
  // Firms ask different things before the approach step — a payout count, a
  // yes/no, a terms toggle — so answer whatever is on screen and move on.
  for (let i = 0; i < 4; i++) {
    if (await page.locator('button[role="radio"][value="dayByDay"]').count()) break
    if (payouts && (await page.locator('#walkthrough-schedule-payouts').count())) {
      await fill(page, '#walkthrough-schedule-payouts', String(payouts))
    }
    if (await page.locator('button[role="radio"][value="no"]').count()) {
      await pick(page, payouts ? 'yes' : 'no')
    }
    await next(page)
  }
  await pick(page, 'dayByDay')
  await next(page)
  if (await page.locator('#walkthrough-balance').count()) {
    await fill(page, '#walkthrough-balance', '52000')
    await next(page)
  }
  for (const [date, amount] of days) {
    await fill(page, '#new-date', date)
    await fill(page, '#new-amount', amount)
    await page.getByRole('button', { name: 'Add day' }).click()
    await page.waitForTimeout(140)
  }
  await next(page)
  await pick(page, strategy)
  await page.getByRole('button', { name: 'Show my plan' }).click()
  await page.waitForTimeout(900)
}

// ---------------------------------------------------------------- 1. the plan
{
  const { ctx, page } = await session()
  await toPlan(page, {
    firm: 'apex', program: 'apex-eod', size: 'apex-100k-eod',
    days: [['2026-09-08', '900'], ['2026-09-09', '780'], ['2026-09-10', '640']],
  })
  await page.screenshot({ path: `${OUT}/1-plan-apex.png`, clip: { x: 0, y: 0, width: 1440, height: 960 } })
  console.log('1 headline:', (await page.locator('h1').first().innerText()).replace(/\n/g, ' '))
  await ctx.close()
}

// ------------------------------------------------------- 2. payout ready, green
{
  const { ctx, page } = await session()
  await toPlan(page, {
    firm: 'tradeify', program: 'tradeify-growth', size: 'tradeify-50k-growth',
    days: [['2026-09-04', '700'], ['2026-09-07', '650'], ['2026-09-08', '600'],
           ['2026-09-09', '560'], ['2026-09-10', '560']],
  })
  await page.screenshot({ path: `${OUT}/2-payout-ready.png`, clip: { x: 0, y: 0, width: 1440, height: 960 } })
  console.log('2 headline:', (await page.locator('h1').first().innerText()).replace(/\n/g, ' '))
  await ctx.close()
}

// ------------------------------------------------------------ 3. the firm list
{
  const { ctx, page } = await session({ height: 1120, dark: true })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/3-firms.png`, clip: { x: 0, y: 0, width: 1440, height: 1120 } })
  console.log('3 firms screen:', (await page.locator('h1').first().innerText()).slice(0, 40))
  await ctx.close()
}

// ------------------------------------------- 4. the rules the app actually knows
{
  const { ctx, page } = await session({ height: 1000 })
  await pick(page, 'apex')
  await next(page)
  await pick(page, 'apex-legacy')
  await next(page)
  await pick(page, 'apex-50k-legacy')
  await next(page)
  await fill(page, '#walkthrough-schedule-payouts', '3')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/4-schedule.png`, clip: { x: 0, y: 0, width: 1440, height: 1000 } })
  console.log('4 schedule step captured')
  await ctx.close()
}

// --------------------------------------------------------- 5. several accounts
{
  const { ctx, page } = await session({ height: 900 })
  await toPlan(page, {
    firm: 'topstep', program: 'topstep-xfa-consistency', size: 'topstep-100k-xfa-consistency',
    days: [['2026-09-09', '1800'], ['2026-09-10', '1500']],
  })
  // A second and third account, so the switcher has something to show.
  for (const [firm, program, size, days] of [
    ['tradeify', 'tradeify-growth', 'tradeify-50k-growth', [['2026-09-10', '450']]],
    ['apex', 'apex-eod', 'apex-50k-eod', [['2026-09-10', '600']]],
  ]) {
    await page.getByRole('button', { name: 'Switch account' }).click()
    await page.waitForTimeout(250)
    await page.getByRole('menuitem', { name: 'Add an account' }).click()
    await page.waitForTimeout(350)
    await toPlan(page, { firm, program, size, days })
  }
  await page.getByRole('button', { name: 'Switch account' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/5-accounts.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } })
  console.log('5 accounts captured')
  await ctx.close()
}

// ------------------------------------------------------------------ 6. on phone
{
  const { ctx, page } = await session({ width: 414, height: 896, scale: 3 })
  await toPlan(page, {
    firm: 'mffu', program: 'mffu-builder', size: 'mffu-50k-builder',
    days: [['2026-09-09', '420'], ['2026-09-10', '380']],
  })
  await page.screenshot({ path: `${OUT}/6-phone.png`, clip: { x: 0, y: 0, width: 414, height: 896 } })
  console.log('6 phone captured')
  await ctx.close()
}


// --------------------------------------------------- 7. the ledger, day by day
{
  const { ctx, page } = await session({ height: 1000 })
  await toPlan(page, {
    firm: 'lucid', program: 'lucid-pro', size: 'lucid-50k-pro',
    days: [['2026-09-07', '520'], ['2026-09-08', '410'], ['2026-09-09', '-180'],
           ['2026-09-10', '640']],
  })
  // Down to where the days are logged and the rules sit beside them.
  await page.evaluate(() => document.querySelector('#ledger-heading')
    ?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/7-ledger.png` })
  console.log('7 ledger captured')
  await ctx.close()
}

// ------------------------------------------------------------ 8. curated plans
{
  const { ctx, page } = await session()
  await toPlan(page, {
    firm: 'topstep', program: 'topstep-xfa-consistency', size: 'topstep-50k-xfa-consistency',
    days: [['2026-09-09', '1400'], ['2026-09-10', '1100']],
  })
  // The plan toggle is a toggle group, so it goes by its label, not a value.
  await page
    .locator('[aria-labelledby="strategy-label"]')
    .getByText('Curated', { exact: true })
    .click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/8-curated.png`, clip: { x: 0, y: 0, width: 1440, height: 960 } })
  console.log('8 curated captured')
  await ctx.close()
}

// ------------------------------------------------------------- 9. taking one
{
  const { ctx, page } = await session({ height: 900, motion: true })
  await toPlan(page, {
    firm: 'mffu', program: 'mffu-builder', size: 'mffu-50k-builder',
    days: [['2026-09-04', '900'], ['2026-09-07', '800'], ['2026-09-08', '700'],
           ['2026-09-09', '760'], ['2026-09-10', '940']],
  })
  await page.getByRole('button', { name: 'Payout taken' }).click()
  // Catch the confetti mid-fall, not after it has settled.
  await page.waitForTimeout(650)
  await page.screenshot({ path: `${OUT}/9-payout-flow.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } })
  console.log('9 payout flow captured')
  await ctx.close()
}

console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no console errors')
await browser.close()
