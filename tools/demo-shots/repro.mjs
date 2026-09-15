import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'msedge' })

async function run({ payoutTaken }) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.addInitScript(() => localStorage.clear())
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const next = async () => { await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(200) }
  const pick = async (v) => { await page.locator(`button[role="radio"][value="${v}"]`).click(); await page.waitForTimeout(120) }

  await pick('tradeify'); await next()
  await pick('tradeify-growth'); await next()
  await pick('tradeify-50k-growth'); await next()
  // Tradeify counts payouts, so the count is what says one was taken.
  if (payoutTaken) await page.locator('#walkthrough-schedule-payouts').fill('1')
  await next()
  await pick('dayByDay'); await next()
  if (await page.locator('#walkthrough-balance').count()) {
    await page.locator('#walkthrough-balance').fill('51200')
    await next()
  }
  for (const [d, a] of [['2026-09-10', '400'], ['2026-09-11', '350']]) {
    await page.locator('#new-date').fill(d)
    await page.locator('#new-amount').fill(a)
    await page.getByRole('button', { name: 'Add day' }).click()
    await page.waitForTimeout(120)
  }
  await next(); await pick('conservative')
  await page.getByRole('button', { name: 'Show my plan' }).click()
  await page.waitForTimeout(700)

  const read = async () => ({
    headline: (await page.locator('h1').first().innerText()).replace(/\n/g, ' '),
    balance: await page.locator('#account-balance').inputValue().catch(() => '(derived)'),
    shown: await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((n) =>
        /Current balance/i.test(n.textContent ?? '') && n.children.length < 4)
      return el?.parentElement?.textContent?.slice(0, 120) ?? '(not found)'
    }),
  })
  const before = await read()
  // Log another day from the dashboard, the way the trader would.
  await page.locator('#new-date').fill('2026-09-14')
  await page.locator('#new-amount').fill('500')
  await page.getByRole('button', { name: 'Add day' }).click()
  await page.waitForTimeout(600)
  const after = await read()
  console.log(`\npayoutTaken=${payoutTaken}`)
  console.log('  before:', before.headline, '| balance field:', before.balance)
  console.log('  after :', after.headline, '| balance field:', after.balance)
  console.log('  panel :', after.shown.replace(/\s+/g, ' ').slice(0, 110))
  await page.context().close()
}

await run({ payoutTaken: false })
await run({ payoutTaken: true })
await browser.close()
