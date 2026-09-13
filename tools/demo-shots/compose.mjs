/**
 * Frame the raw captures for sharing: a caption in the app's own typeface, on
 * a ground tinted to the theme each screen was captured in.
 *
 *   node tools/demo-shots/capture.mjs     # first, for out/
 *   node tools/demo-shots/crop.mjs        # trims each to its subject
 *   node tools/demo-shots/compose.mjs     # writes out/cards/
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const HERE = new URL('.', import.meta.url).pathname.replace(/^\//, '')
const FONT = new URL(
  '../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2',
  import.meta.url,
).pathname.replace(/^\//, '')
mkdirSync(`${HERE}out/cards`, { recursive: true })

const CARDS = [
  {
    out: 'out/cards/1-plan.png', size: [1600, 900], shot: 'out/crop/1-plan-apex.png',
    // Show the headline and the chart: crop the dead space under it.
    crop: '0 0 100% 78%',
    bg: 'radial-gradient(120% 120% at 15% 0%, #101a4d 0%, #050927 55%, #03051a 100%)',
    fg: '#f4f6ff', dim: '#a7afd2', accent: '#5ac7fa',
    kicker: 'Max payout calculator',
    title: 'The exact days, and the exact daily number',
    sub: 'Your firm’s own payout rules, worked out for the account you actually have.',
  },
  {
    out: 'out/cards/2-ready.png', size: [1600, 900], shot: 'out/crop/2-payout-ready.png',
    crop: '0 0 100% 78%',
    bg: 'radial-gradient(120% 120% at 80% 0%, #123321 0%, #08080a 60%, #050506 100%)',
    fg: '#f0edec', dim: '#b8b1ae', accent: '#00ff51',
    kicker: 'It tells you when to stop',
    title: 'Payout ready',
    sub: 'Trading days done, consistency held, balance clear. Take it.',
  },
  {
    out: 'out/cards/3-firms.png', size: [1600, 900], shot: 'out/crop/firms.png', tall: true,
    crop: '0 4% 100% 86%',
    bg: 'linear-gradient(160deg, #f7f9fa 0%, #e3e8ee 60%, #d7dee6 100%)',
    fg: '#18212b', dim: '#56636f', accent: '#2f4bd8',
    kicker: 'Five firms, one calculator',
    title: 'Every size, schedule and consistency rule',
    sub: 'MyFundedFutures · Tradeify · Topstep · Lucid Trading · Apex Trader Funding',
  },
  {
    out: 'out/cards/4-phone.png', size: [1080, 1080], shot: 'out/6-phone.png',
    portrait: true, crop: '0 0 100% 100%',
    bg: 'radial-gradient(110% 110% at 50% 0%, #16233c 0%, #02040e 65%, #01020a 100%)',
    fg: '#f5f7ff', dim: '#a8b5c9', accent: '#3a82f7',
    kicker: 'On the desk or in your pocket',
    title: 'Plan your payout anywhere',
    sub: 'Saved in your browser. Nothing sent anywhere.',
  },
]

const page = await (await (await chromium.launch({ channel: 'msedge' })).newContext({
  viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2,
})).newPage()

for (const c of CARDS) {
  const [w, h] = c.size
  await page.setViewportSize({ width: w, height: h })
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
        display: flex; ${c.portrait ? 'flex-direction: column; align-items: center; text-align: center;' : 'align-items: center;'}
        gap: ${c.portrait ? '34px' : '56px'};
        padding: ${c.portrait ? '46px 64px 0' : c.tall ? '0 56px 0 72px' : '0 0 0 72px'};
        ${c.tall ? 'justify-content: space-between;' : ''}
      }
      .copy { ${c.portrait ? 'max-width: 900px;' : c.tall ? 'width: 40%; flex: none;' : 'width: 46%; flex: none;'} }
      .kicker {
        font-size: ${c.portrait ? 24 : 23}px; font-weight: 600; font-stretch: 108%;
        letter-spacing: 0.04em; text-transform: uppercase; color: ${c.accent};
      }
      h1 {
        margin-top: 16px;
        font-size: ${c.portrait ? 54 : c.tall ? 60 : 66}px; font-weight: 800; font-stretch: 114%;
        line-height: 1.0; letter-spacing: -0.025em;
      }
      p { margin-top: ${c.portrait ? 16 : 26}px; font-size: ${c.portrait ? 25 : 26}px; line-height: 1.4; color: ${c.dim}; }
      .shot {
        ${c.portrait
          ? 'height: 620px;'
          : c.tall
            ? 'height: 82%; flex: none;'
            : 'flex: 1; height: 78%;'}
        border-radius: ${c.portrait ? 34 : 20}px;
        overflow: hidden;
        box-shadow: 0 40px 90px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08);
        ${c.portrait || c.tall ? '' : 'margin-right: -140px;'}
      }
      .shot img { display: block; ${c.portrait || c.tall ? 'height: 100%; width: auto;' : 'width: 100%;'} clip-path: inset(${c.crop.split(' ').map((v, i) => (i === 2 ? `calc(100% - ${v})` : i === 3 ? `calc(100% - ${v})` : v)).join(' ')}); }
      .shot.plain img { clip-path: none; }
    </style>
    <div class="copy">
      <div class="kicker">${c.kicker}</div>
      <h1>${c.title}</h1>
      <p>${c.sub}</p>
    </div>
    <div class="shot plain"><img src="${c.shot}" /></div>
  `
  // A real file, not setContent: an about:blank page cannot load file:// images.
  writeFileSync(`${HERE}card.html`, html)
  await page.goto(`file:///${HERE}card.html`)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${HERE}${c.out}` })
  console.log('wrote', c.out)
}
await page.context().browser().close()
