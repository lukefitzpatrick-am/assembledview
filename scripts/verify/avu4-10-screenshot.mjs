import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const html = path.resolve(__dirname, "avu4-10-campaigns-hero.html")

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 1600 })
await page.goto(`file:///${html.replace(/\\/g, "/")}`)
await page.waitForTimeout(50)

for (const id of ["wide", "narrow", "collapsed-sidebar"]) {
  const el = await page.$(`#${id}`)
  if (!el) throw new Error(`missing #${id}`)
  await el.screenshot({ path: path.join(__dirname, `avu4-10-${id}.png`) })
  console.log("shot", id)
}

await browser.close()
