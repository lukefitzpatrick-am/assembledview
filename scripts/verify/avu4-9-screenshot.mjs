import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const html = path.resolve(__dirname, "avu4-9-search-layout.html")

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 780, height: 900 })
await page.goto(`file:///${html.replace(/\\/g, "/")}`)
await page.waitForTimeout(50)

for (const id of ["before", "after", "loading"]) {
  const el = await page.$(`#${id}`)
  if (!el) throw new Error(`missing #${id}`)
  await el.screenshot({ path: path.join(__dirname, `avu4-9-${id}.png`) })
  console.log("shot", id)
}

await browser.close()
