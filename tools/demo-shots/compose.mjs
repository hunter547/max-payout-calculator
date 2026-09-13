/**
 * Frame the captures for sharing: a caption in the app's own typeface, on a
 * ground tinted to the theme each screen was captured in.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/demo-shots/capture.mjs    # writes out/
 *   node tools/demo-shots/compose.mjs    # writes out/cards/
 *
 * Each card says where the shot sits: `contain` to show all of it, `cover` to
 * fill the frame from the top, which is what suits a dashboard.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const HERE = new URL('.', import.meta.url).pathname.replace(/^\//, '')
const FONT = new URL(
  '../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
  import.meta.url,
).pathname.replace(/^\//, '')
mkdirSync(`${HERE}out/cards`, { recursive: true })

const WIDE = [1600, 900]
const SQUARE = [1080, 1080]

const CARDS = [
  {
    out: '01-the-plan', size: WIDE, shot: 'out/1-plan-apex.png', fit: 'cover',
    bg: 'radial-gradient(120% 120% at 15% 0%, #101a4d 0%, #050927 55%, #03051a 100%)',
    fg: '#f4f6ff', dim: '#a7afd2', accent: '#5ac7fa',
    kicker: 'Max payout calculator',
    title: 'The exact days, and the exact daily number',
    sub: 'Your firm’s own payout rules, worked out for the account you actually have.',
  },
  {
    out: '02-payout-ready', size: WIDE, shot: 'out/2-payout-ready.png', fit: 'cover',
    bg: 'radial-gradient(120% 120% at 80% 0%, #123321 0%, #08080a 60%, #050506 100%)',
    fg: '#f0edec', dim: '#b8b1ae', accent: '#00ff51',
    kicker: 'It tells you when to stop',
    title: 'Payout ready',
    sub: 'Trading days done, consistency held, balance clear. Take it.',
  },
  {
    out: '03-five-firms', size: WIDE, shot: 'out/3-firms.png', fit: 'contain',
    bg: 'linear-gradient(160deg, #f7f9fa 0%, #e3e8ee 60%, #d7dee6 100%)',
    fg: '#18212b', dim: '#56636f', accent: '#2f4bd8',
    kicker: 'Five firms, one calculator',
    title: 'Every size, schedule and consistency rule',
    sub: 'MyFundedFutures · Tradeify · Topstep · Lucid Trading · Apex Trader Funding',
  },
  {
    out: '04-on-phone', size: SQUARE, shot: 'out/6-phone.png', fit: 'contain', portrait: true,
    bg: 'radial-gradient(110% 110% at 50% 0%, #16233c 0%, #02040e 65%, #01020a 100%)',
    fg: '#f5f7ff', dim: '#a8b5c9', accent: '#3a82f7',
    kicker: 'On the desk or in your pocket',
    title: 'Plan your payout anywhere',
    sub: 'Saved in your browser. Nothing sent anywhere.',
  },
  {
    out: '05-by-payout-number', size: WIDE, shot: 'out/4-schedule.png', fit: 'cover',
    at: 'center center',
    bg: 'radial-gradient(120% 120% at 85% 10%, #16205c 0%, #050927 60%, #03051a 100%)',
    fg: '#f4f6ff', dim: '#a7afd2', accent: '#5ac7fa',
    kicker: 'Payout four is not payout one',
    title: 'It follows the schedule, not an average',
    sub: 'Caps that climb, consistency that lapses, a safety net that stops applying — it knows which payout you are on.',
  },
  {
    out: '06-several-accounts', size: WIDE, shot: 'out/5-accounts.png', fit: 'cover',
    bg: 'radial-gradient(120% 120% at 20% 0%, #1b2945 0%, #000000 60%, #000000 100%)',
    fg: '#ffffff', dim: '#a9b0bb', accent: '#d5a161',
    kicker: 'Trading more than one?',
    title: 'Every account, side by side',
    sub: 'Each keeps its own plan, its own ledger and its own firm’s colours. Switch from the header.',
  },
  {
    out: '07-log-the-day', size: WIDE, shot: 'out/7-ledger.png', fit: 'cover',
    bg: 'radial-gradient(120% 120% at 75% 0%, #12332a 0%, #090909 60%, #050505 100%)',
    fg: '#ffffff', dim: '#a6abb0', accent: '#61f8ab',
    kicker: 'Log the day, see the day',
    title: 'Your P&L in, the plan back out',
    sub: 'Largest day, net profit and the days that count all follow from what you log — and every rule stays editable.',
  },
  {
    out: '08-your-pace', size: WIDE, shot: 'out/8-curated.png', fit: 'cover',
    bg: 'radial-gradient(120% 120% at 25% 0%, #2a2317 0%, #000000 62%, #000000 100%)',
    fg: '#ffffff', dim: '#a9b0bb', accent: '#d5a161',
    kicker: 'Or set the pace yourself',
    title: 'Pick the days. It finds the number.',
    sub: 'Choose how many trading days you want, or the most you will make in one, and the plan rebuilds around it.',
  },
  {
    out: '09-take-it', size: SQUARE, shot: 'out/9-payout-flow.png', fit: 'cover', portrait: true,
    bg: 'radial-gradient(110% 110% at 50% 0%, #14224a 0%, #02040e 62%, #01020a 100%)',
    fg: '#f5f7ff', dim: '#a8b5c9', accent: '#3a82f7',
    kicker: 'Then it starts the next one',
    title: 'Took a payout?',
    sub: 'Enter what you withdrew; the balance, the cleared ledger and the next cycle follow.',
  },
]

const browser = await chromium.launch({ channel: 'msedge' })
const page = await (
  await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
).newPage()

for (const c of CARDS) {
  const [w, h] = c.size
  await page.setViewportSize({ width: w, height: h })
  const contain = c.fit === 'contain'
  const html = `
    <style>
      @font-face {
        font-family: 'Archivo Variable';
        font-weight: 100 900; font-stretch: 62% 125%;
        src: url('file:///${FONT}') format('woff2-variations');
      }
      * { box-sizing: border-box; margin: 0; }
      body {
        width: ${w}px; height: ${h}px; overflow: hidden;
        background: ${c.bg};
        font-family: 'Archivo Variable', system-ui, sans-serif;
        color: ${c.fg};
        display: flex;
        ${c.portrait
          ? 'flex-direction: column; align-items: center; text-align: center;'
          : 'align-items: center; justify-content: space-between;'}
        gap: ${c.portrait ? '30px' : '52px'};
        padding: ${c.portrait ? '46px 64px 0' : contain ? '0 56px 0 72px' : '0 0 0 72px'};
      }
      .copy { ${c.portrait ? 'max-width: 900px;' : 'width: 42%; flex: none;'} }
      .kicker {
        font-size: 23px; font-weight: 600; font-stretch: 108%;
        letter-spacing: 0.04em; text-transform: uppercase; color: ${c.accent};
      }
      h1 {
        margin-top: 16px;
        font-size: ${c.portrait ? 56 : 62}px; font-weight: 800; font-stretch: 114%;
        line-height: 1.0; letter-spacing: -0.025em;
      }
      p { margin-top: ${c.portrait ? 16 : 24}px; font-size: ${c.portrait ? 24 : 25}px; line-height: 1.4; color: ${c.dim}; }
      .shot {
        ${c.portrait
          ? 'width: 100%; flex: 1; min-height: 0;'
          : contain
            ? 'height: 82%; flex: none;'
            : 'flex: 1; height: 78%; margin-right: -140px;'}
        border-radius: ${c.portrait ? 26 : 20}px;
        overflow: hidden;
        box-shadow: 0 40px 90px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
      .shot img {
        display: block; width: 100%; height: 100%;
        object-fit: ${contain ? 'contain' : 'cover'};
        object-position: ${c.at ?? 'top center'};
      }
    </style>
    <div class="copy">
      <div class="kicker">${c.kicker}</div>
      <h1>${c.title}</h1>
      <p>${c.sub}</p>
    </div>
    <div class="shot"><img src="${c.shot}" /></div>
  `
  // A real file, not setContent: an about:blank page cannot load file:// images.
  writeFileSync(`${HERE}card.html`, html)
  await page.goto(`file:///${HERE}card.html`)
  await page.waitForTimeout(800)
  const name = `${c.out}-${w}x${h}.png`
  await page.screenshot({ path: `${HERE}out/cards/${name}` })
  console.log('wrote', name)
}
await browser.close()
