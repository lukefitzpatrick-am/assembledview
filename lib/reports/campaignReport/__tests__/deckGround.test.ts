import assert from "node:assert/strict"
import test from "node:test"
import JSZip from "jszip"

import { buildCampaignReportDeck } from "@/lib/reports/campaignReport/buildCampaignReportDeck"
import type { CampaignReportPayload } from "@/lib/reports/campaignReport/assembleCampaignReportData"
import { campaignReportPeriodMetrics } from "@/lib/reports/campaignReport/periodMetrics"
import { campaignReportFixture } from "../../../../scripts/smoke-campaign-report-fixture"

type Box = { x: number; y: number; w: number; h: number }
type Run = { text: string; colour: string; typeface: string; size: string }
type Slide = { xml: string; layoutName: string; layoutBg: string }

function emu(value: string): number {
  return Number(value) / 914400
}

function anchorFrom(chunk: string): Box | null {
  const off = chunk.match(/<a:off[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/)
  const ext = chunk.match(/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
  if (!off || !ext) return null
  return { x: emu(off[1]!), y: emu(off[2]!), w: emu(ext[1]!), h: emu(ext[2]!) }
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function textRuns(xml: string): Run[] {
  const runs: Run[] = []
  for (const chunk of xml.split(/<a:r[ >]/).slice(1)) {
    const text = [...chunk.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((match) => match[1] ?? "").join("")
    if (!text.trim()) continue
    runs.push({
      text,
      colour: chunk.match(/srgbClr val="([A-Fa-f0-9]{6})"/i)?.[1]?.toUpperCase() ?? "",
      typeface: chunk.match(/typeface="([^"]*)"/)?.[1] ?? "",
      size: chunk.match(/\bsz="(\d+)"/)?.[1] ?? chunk.match(/<a:sz[^>]*val="(\d+)"/)?.[1] ?? "",
    })
  }
  return runs
}

function isDark(layoutName: string, layoutBg: string): boolean {
  if (layoutName.toLowerCase().includes("black")) return true
  if (!/^[0-9A-F]{6}$/i.test(layoutBg)) return false
  const r = Number.parseInt(layoutBg.slice(0, 2), 16)
  const g = Number.parseInt(layoutBg.slice(2, 4), 16)
  const b = Number.parseInt(layoutBg.slice(4, 6), 16)
  return (r + g + b) / 3 < 90
}

async function slidesOf(buf: Buffer): Promise<{ zip: JSZip; slides: Slide[] }> {
  const zip = await JSZip.loadAsync(buf)
  const pres = await zip.file("ppt/presentation.xml")!.async("string")
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")!.async("string")
  const targetById = new Map<string, string>()
  for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    targetById.set(match[1]!, match[2]!)
  }
  const names: string[] = []
  for (const match of pres.matchAll(/<p:sldId[^>]*r:id="([^"]+)"/g)) {
    const target = targetById.get(match[1]!) ?? ""
    const base = target.split("/").pop()
    if (base) names.push(`ppt/slides/${base}`)
  }
  const slides: Slide[] = []
  for (const name of names) {
    const xml = await zip.file(name)!.async("string")
    const base = name.split("/").pop()!
    const rels = await zip.file(`ppt/slides/_rels/${base}.rels`)?.async("string")
    const layoutFile = rels?.match(/slideLayouts\/(slideLayout\d+\.xml)/)?.[1]
    const layoutXml = layoutFile ? await zip.file(`ppt/slideLayouts/${layoutFile}`)?.async("string") : ""
    const layoutName = layoutXml?.match(/<p:cSld[^>]*name="([^"]*)"/)?.[1] ?? ""
    const layoutBg =
      layoutXml?.match(/<p:bg>[\s\S]*?<\/p:bg>/)?.[0]?.match(/srgbClr val="([A-Fa-f0-9]{6})"/i)?.[1]?.toUpperCase() ??
      ""
    slides.push({ xml, layoutName, layoutBg })
  }
  return { zip, slides }
}

function wordmark(layoutXml: string): Box | null {
  let found: Box | null = null
  for (const chunk of layoutXml.split(/<p:pic[\s>]/).slice(1)) {
    const name = chunk.match(/name="([^"]*)"/)?.[1] ?? ""
    const box = anchorFrom(chunk)
    if (!box || !name.startsWith("Image")) continue
    if (box.y < 1.2 && box.h < 0.8) found = box
  }
  return found
}

test("dark layout slides do not use ink, and the thank-you slide is not white on white", async () => {
  const deck = await buildCampaignReportDeck(campaignReportFixture)
  const { slides } = await slidesOf(deck)
  const dark = slides.filter((slide) => isDark(slide.layoutName, slide.layoutBg))
  assert.ok(dark.length > 0, "expected a dark thank-you slide")
  for (const slide of dark) {
    for (const run of textRuns(slide.xml)) {
      assert.notEqual(run.colour, "0F1D13", `ink on ${slide.layoutName}: ${run.text}`)
    }
  }

  const thanks = slides.find((slide) => slide.xml.includes("Thank you."))
  assert.ok(thanks)
  assert.notEqual(thanks.layoutBg, "FFFFFF")
  assert.match(thanks.layoutName, /Black/)
  const title = textRuns(thanks.xml).find((run) => run.text.includes("Thank you."))
  assert.ok(title)
  assert.equal(title.colour, "FFFFFF")
})

test("cover title sits in the title box and does not cover the logo", async () => {
  const deck = await buildCampaignReportDeck(campaignReportFixture)
  const { zip, slides } = await slidesOf(deck)
  const cover = slides.find((slide) => slide.xml.includes("campaign report."))
  assert.ok(cover)
  assert.match(cover.xml, /Penfold always on campaign report\./)
  assert.match(cover.xml, /MBA PENFOLD013\./)

  const titleChunk = cover.xml.split(/<p:sp[\s>]/).find((chunk) => chunk.includes("campaign report."))
  const detailChunk = cover.xml.split(/<p:sp[\s>]/).find((chunk) => chunk.includes("MBA PENFOLD013."))
  assert.ok(titleChunk)
  assert.ok(detailChunk)
  const titleBox = anchorFrom(titleChunk)
  const detailBox = anchorFrom(detailChunk)
  assert.ok(titleBox)
  assert.ok(detailBox)
  assert.ok(detailBox.y > titleBox.y + 1, "detail lines sit below the title")

  let logo: Box | null = null
  for (const name of Object.keys(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/.test(file))) {
    const xml = await zip.file(name)!.async("string")
    if (!xml.includes("campaign report.")) continue
    const base = name.split("/").pop()!
    const rels = await zip.file(`ppt/slides/_rels/${base}.rels`)!.async("string")
    const layoutFile = rels.match(/slideLayouts\/(slideLayout\d+\.xml)/)?.[1]
    assert.ok(layoutFile)
    const layoutXml = await zip.file(`ppt/slideLayouts/${layoutFile}`)!.async("string")
    logo = wordmark(layoutXml)
  }
  assert.ok(logo, "cover layout wordmark")
  assert.equal(overlaps(titleBox, logo), false)
})

test("headings are ExtraBold at 36pt, and 32pt when the title wraps", async () => {
  const longLabel = "Programmatic display across every market in the plan"
  const payload: CampaignReportPayload = {
    ...campaignReportFixture,
    channels: [{ ...campaignReportFixture.channels[0]!, label: longLabel }],
  }
  const deck = await buildCampaignReportDeck(payload)
  const { slides } = await slidesOf(deck)
  const summary = slides.find((slide) => slide.xml.includes("Period summary."))
  assert.ok(summary)
  const period = textRuns(summary.xml).find((run) => run.text.includes("Period summary."))
  assert.ok(period)
  assert.equal(period.typeface, "Plus Jakarta Sans ExtraBold")
  assert.equal(period.size, "3600")

  const body = textRuns(summary.xml).find((run) => run.text.includes("Key metrics."))
  assert.ok(body)
  assert.equal(body.typeface, "Plus Jakarta Sans")

  const wrapped = slides.find((slide) => slide.xml.includes(`${longLabel} spend.`))
  assert.ok(wrapped)
  const heading = textRuns(wrapped.xml).find((run) => run.text.includes(`${longLabel} spend.`))
  assert.ok(heading)
  assert.equal(heading.typeface, "Plus Jakarta Sans ExtraBold")
  assert.equal(heading.size, "3200")
})

test("a zero-spend channel with no impressions has no channel slides", async () => {
  const quiet = {
    ...campaignReportFixture.channels[0]!,
    label: "Programmatic video",
    spend: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    metrics: campaignReportPeriodMetrics({
      spend: 0,
      impressions: 0,
      clicks: 0,
      video3sViews: 0,
      expectedSpend: 0,
    }),
  }
  const heard = {
    ...campaignReportFixture.channels[1]!,
    label: "Audio",
    spend: 0,
    impressions: 40,
  }
  const payload: CampaignReportPayload = {
    ...campaignReportFixture,
    channels: [quiet, heard],
  }
  const deck = await buildCampaignReportDeck(payload)
  const { slides } = await slidesOf(deck)
  const text = slides.map((slide) => slide.xml).join("\n")
  assert.equal(text.includes("Programmatic video spend."), false)
  assert.equal(text.includes("Programmatic video data."), false)
  assert.match(text, /Not yet live\. Programmatic video\./)
  assert.match(text, /Audio spend\./)
  assert.match(text, /Audio data\./)
  const data = slides.find((slide) => slide.xml.includes("Audio data."))
  assert.ok(data)
  assert.equal(data.layoutName.includes("Black"), false)
  assert.equal(/B5D337/i.test(data.xml), false)
})
