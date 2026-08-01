import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const html = path.resolve(__dirname, "avu4-8-hero-layouts.html")
const outDir = __dirname

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`file:///${html.replace(/\\/g, "/")}`)

for (const id of ["admin-wide", "admin-narrow", "client-wide", "client-narrow"]) {
  const el = await page.$(`#${id}`)
  if (!el) throw new Error(`missing #${id}`)
  await el.screenshot({ path: path.join(outDir, `avu4-8-${id}.png`) })
  console.log("shot", id)
}

await browser.close()
