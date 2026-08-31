/* 미리보기 정지컷. node tools/shots.js <출력폴더> <t1> <t2> ... */
const { chromium } = require('playwright')
const path = require('path')

;(async () => {
  const [outDir, ...times] = process.argv.slice(2)
  const W = +(process.env.W || 1080), H = +(process.env.H || 1920)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()) })
  page.on('requestfailed', r => console.log('REQ FAIL:', r.url(), r.failure() && r.failure().errorText))
  page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()) })
  const url = (process.env.BASE || 'http://127.0.0.1:8731') + `/f1.html?w=${W}&h=${H}`
  await page.goto(url)
  await page.waitForFunction('window.__READY === true', null, { timeout: 120000, polling: 500 })
  for (const t of times) {
    await page.evaluate(tt => window.seek(tt), +t)
    const f = path.join(outDir, `t${String(t).padStart(6, '0')}.png`)
    await page.screenshot({ path: f })
    console.log('  ', f)
  }
  await browser.close()
})()
