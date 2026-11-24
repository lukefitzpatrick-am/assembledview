import assert from "node:assert/strict"
import test from "node:test"

import ExcelJS from "exceljs"

import { AA_INSERTIONS_SHEET, AA_SUPPLIER_SHEET } from "../aaWorkbookSheets.js"
import { exportAudienceFor, filterWorkbookBufferForAudience } from "../exportSheetVisibility.js"
import { buildMediaPlanWorkbook } from "../mediaPlanWorkbook.js"
import { setFeatureRowReaderForTests } from "@/lib/features/server"
import { addKPISheet, generateMediaPlan } from "@/lib/generateMediaPlan"
import type { KPISheetRow, LineItem, MediaItems, MediaPlanHeader } from "@/lib/generateMediaPlan"

const KEYS = [
  "search", "socialMedia", "digiAudio", "digiDisplay", "digiVideo", "bvod", "progDisplay",
  "progVideo", "progBvod", "progOoh", "progAudio", "newspaper", "magazines", "television",
  "radio", "ooh", "cinema", "integration", "influencers", "production",
] as const

function items(overrides: Partial<MediaItems>): MediaItems {
  const out = Object.fromEntries(KEYS.map((k) => [k, []])) as unknown as MediaItems
  return { ...out, ...overrides }
}

const header: MediaPlanHeader = {
  logoBase64: "",
  logoWidth: 0,
  logoHeight: 0,
  client: "Acme",
  brand: "Acme",
  campaignName: "Visibility",
  mbaNumber: "ACME001",
  clientContact: "",
  planVersion: "1",
  poNumber: "",
  campaignBudget: "$1,500.00",
  campaignStatus: "approved",
  campaignStart: "01/10/2026",
  campaignEnd: "31/10/2026",
}
const asOf = new Date("2026-10-19T00:00:00.000Z")

function ooh(id: string, network: string, gross: string, clientPays = false): LineItem {
  return {
    market: "Sydney",
    network,
    oohFormat: "large_format",
    placement: "Road",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    deliverables: 1,
    buyType: "panels",
    deliverablesAmount: gross,
    grossMedia: gross,
    line_item_id: id,
    buyAmount: gross,
    clientPaysForMedia: clientPays,
  }
}

const aaItems = () =>
  items({ ooh: [ooh("OH1", "JCDecaux", "1000"), ooh("OH9", "QMS", "0", true)] })
const aaMba = {
  gross_media: [{ media_type: "OOH", gross_amount: 1000 }],
  totals: { gross_media: 1000, service_fee: 0, production: 0, adserving: 0, totals_ex_gst: 1000, total_inc_gst: 1100 },
}

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer)
}

async function aaBuffer(showClientPays = false): Promise<Buffer> {
  return toBuffer(
    await generateMediaPlan(header, aaItems(), aaMba, {
      asOf,
      mbaTotalsLayout: "aa",
      aaShowClientPays: showClientPays,
    }),
  )
}

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return workbook
}

function texts(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = []
  ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value ?? ""))))
  return out
}

const kpi: KPISheetRow = {
  mediaType: "ooh",
  publisher: "JCDecaux",
  label: "Road",
  buyType: "panels",
  spend: 1000,
  deliverables: 1,
  ctr: null,
  vtr: null,
  cpv: null,
  conversion_rate: null,
  frequency: null,
  calculatedClicks: null,
  calculatedViews: null,
  calculatedReach: null,
}

test("a client gets the AA workbook without Monthly by supplier, and the Media Plan sheet intact", async () => {
  const source = await aaBuffer()
  const before = await load(source)
  const after = await load(await filterWorkbookBufferForAudience(source, "client"))
  assert.deepEqual(after.worksheets.map((ws) => ws.name), ["Media Plan", AA_INSERTIONS_SHEET])
  const plan = after.getWorksheet("Media Plan")!
  assert.deepEqual(texts(plan), texts(before.getWorksheet("Media Plan")!))
  assert.deepEqual(plan.model.merges, before.getWorksheet("Media Plan")!.model.merges)
  assert.equal(plan.pageSetup.printTitlesRow, before.getWorksheet("Media Plan")!.pageSetup.printTitlesRow)
})

test("the client logo survives the filter", async () => {
  // 1x1 transparent PNG.
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  const source = await toBuffer(
    await generateMediaPlan({ ...header, logoBase64: png, logoWidth: 10, logoHeight: 10 }, aaItems(), aaMba, {
      asOf,
      mbaTotalsLayout: "aa",
    }),
  )
  const after = await load(await filterWorkbookBufferForAudience(source, "client"))
  assert.equal(after.getWorksheet("Media Plan")!.getImages().length, 1)
})

test("a supplier keeps every AA sheet, and loses Campaign KPIs from a plan workbook", async () => {
  const aa = await load(await filterWorkbookBufferForAudience(await aaBuffer(), "supplier"))
  assert.deepEqual(aa.worksheets.map((ws) => ws.name), ["Media Plan", AA_SUPPLIER_SHEET, AA_INSERTIONS_SHEET])

  const standard = await generateMediaPlan(header, aaItems(), aaMba, { asOf })
  addKPISheet(standard, [kpi])
  const buffer = await toBuffer(standard)
  const supplier = await load(await filterWorkbookBufferForAudience(buffer, "supplier"))
  assert.deepEqual(supplier.worksheets.map((ws) => ws.name), ["Media Plan"])
  const client = await load(await filterWorkbookBufferForAudience(buffer, "client"))
  assert.deepEqual(client.worksheets.map((ws) => ws.name), ["Media Plan", "Campaign KPIs"])
})

test("staff (internal) get the stored bytes back untouched", async () => {
  const source = await aaBuffer()
  assert.equal(await filterWorkbookBufferForAudience(source, "internal"), source)
})

test("a sheet missing from the map is internal only, and a workbook with nothing left throws", async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet("Media Plan").getCell(1, 1).value = "plan"
  workbook.addWorksheet("Margin").getCell(1, 1).value = "internal"
  const client = await load(await filterWorkbookBufferForAudience(await toBuffer(workbook), "client"))
  assert.deepEqual(client.worksheets.map((ws) => ws.name), ["Media Plan"])

  const secret = new ExcelJS.Workbook()
  secret.addWorksheet("Margin").getCell(1, 1).value = "internal"
  await assert.rejects(filterWorkbookBufferForAudience(await toBuffer(secret), "supplier"), /No sheet/)
})

test("only admin is the internal audience; every other caller is a client", () => {
  assert.equal(exportAudienceFor({ isAdmin: true }), "internal")
  assert.equal(exportAudienceFor({}), "client")
  assert.equal(exportAudienceFor({ isAdmin: undefined }), "client")
})

test("AA with the switch on lists a client-pays line marked, at $0, and keeps the totals", async () => {
  const on = await load(await aaBuffer(true))
  const off = await load(await aaBuffer(false))

  const planOn = texts(on.getWorksheet("Media Plan")!)
  assert.ok(planOn.includes("Panels · Client pays"), "Media Plan marks the client-pays line")
  assert.ok(planOn.includes("QMS"))
  assert.ok(!texts(off.getWorksheet("Media Plan")!).includes("QMS"), "off: dropped as before")

  const ins = on.getWorksheet(AA_INSERTIONS_SHEET)!
  assert.equal(String(ins.getCell(1, 12).value), "Client pays")
  let found = 0
  for (let row = 2; row <= ins.rowCount; row++) {
    const id = String(ins.getCell(row, 1).value ?? "")
    if (id === "OH9") {
      found++
      assert.equal(ins.getCell(row, 10).value, 0)
      assert.equal(String(ins.getCell(row, 12).value), "Yes")
    }
    if (id === "OH1") {
      assert.equal(ins.getCell(row, 10).value, 1000)
      assert.equal(String(ins.getCell(row, 12).value ?? ""), "")
    }
  }
  assert.equal(found, 1)
  const insOff = off.getWorksheet(AA_INSERTIONS_SHEET)!
  assert.equal(insOff.getCell(1, 12).value, null, "off: no Client pays column")

  // The supplier totals are the same: the client-pays line adds no money.
  const sumOn = texts(on.getWorksheet(AA_SUPPLIER_SHEET)!)
  const sumOff = texts(off.getWorksheet(AA_SUPPLIER_SHEET)!)
  assert.deepEqual(sumOn, sumOff)
})

test("standard sheet: a client-pays CPM line reads CPM · Client pays, keeps the CPM rate and never merges", async () => {
  const social = (clientPays: boolean): LineItem => ({
    market: "National",
    platform: "Meta",
    bidStrategy: "reach",
    targeting: "Adults",
    creative: "Video",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    deliverables: 100000,
    buyType: "cpm",
    deliverablesAmount: "1000",
    grossMedia: "1000",
    buyAmount: "10",
    clientPaysForMedia: clientPays,
  })
  const mba = {
    gross_media: [{ media_type: "Social Media", gross_amount: 2000 }],
    totals: { gross_media: 2000, service_fee: 0, production: 0, adserving: 0, totals_ex_gst: 2000, total_inc_gst: 2200 },
  }
  const wb = await generateMediaPlan(header, items({ socialMedia: [social(false), social(true)] }), mba, { asOf })
  const sheet = wb.getWorksheet("Media Plan")!
  const buyTypeRows: { text: string; rate: unknown }[] = []
  sheet.eachRow((row) => {
    row.eachCell((cell, col) => {
      const text = String(cell.value ?? "")
      if (text === "CPM" || text === "CPM · Client pays") {
        buyTypeRows.push({ text, rate: row.getCell(col + 1).value })
      }
    })
  })
  assert.deepEqual(
    buyTypeRows.map((r) => r.text).sort(),
    ["CPM", "CPM · Client pays"],
    "two rows: the client-pays line does not merge into the agency line",
  )
  for (const row of buyTypeRows) assert.equal(row.rate, 10, `${row.text} rate is per thousand`)
})

test("AA Insertions bill $0 on a client-pays line even when it carries media", async () => {
  const wb = await generateMediaPlan(
    header,
    items({ ooh: [ooh("OH1", "JCDecaux", "1000"), ooh("OH8", "QMS", "250", true)] }),
    aaMba,
    { asOf, mbaTotalsLayout: "aa", aaShowClientPays: true },
  )
  const ins = wb.getWorksheet(AA_INSERTIONS_SHEET)!
  for (let row = 2; row <= ins.rowCount; row++) {
    if (String(ins.getCell(row, 1).value) === "OH8") {
      assert.equal(ins.getCell(row, 10).value, 0)
      return
    }
  }
  assert.fail("OH8 missing from Insertions")
})

test("a defined name pointing at a removed sheet is dropped; one on a kept sheet stays", async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet("Media Plan").getCell(1, 1).value = "plan"
  workbook.addWorksheet(AA_SUPPLIER_SHEET).getCell(1, 1).value = 100
  workbook.definedNames.add(`'${AA_SUPPLIER_SHEET}'!$A$1`, "SupRange")
  workbook.definedNames.add("'Media Plan'!$A$1", "PlanCell")
  const out = await load(await filterWorkbookBufferForAudience(await toBuffer(workbook), "client"))
  assert.deepEqual(out.definedNames.model.map((entry) => entry.name), ["PlanCell"])
})

test("Production rows carry Client pays in the Buy Type column, standard and AA", async () => {
  const production = (id: string, clientPays: boolean): LineItem => ({
    market: "National",
    network: "Studio",
    creative: "Shoot",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    deliverables: 1,
    buyType: "production",
    deliverablesAmount: "100",
    grossMedia: "100",
    line_item_id: id,
    clientPaysForMedia: clientPays,
  })
  const mba = {
    gross_media: [{ media_type: "Production", gross_amount: 200 }],
    totals: { gross_media: 0, service_fee: 0, production: 200, adserving: 0, totals_ex_gst: 200, total_inc_gst: 220 },
  }
  const wb = await generateMediaPlan(header, items({ production: [production("PR1", false), production("PR2", true)] }), mba, { asOf })
  assert.equal(texts(wb.getWorksheet("Media Plan")!).filter((t) => t === "Client pays").length, 1)
})

test("a published Campaign KPIs row for a client-pays line reads · Client pays", async () => {
  const wb = new ExcelJS.Workbook()
  addKPISheet(wb, [kpi, { ...kpi, publisher: "QMS", clientPays: true }])
  const cells = texts(wb.getWorksheet("Campaign KPIs")!)
  assert.ok(cells.includes("Panels · Client pays"))
  assert.equal(cells.filter((t) => t === "Panels").length, 1)
})

test("the AA workbook builder lists client-pays lines only under aa_client_pays_lines, not the visibility switch", async () => {
  const on = (key: string) => [key, { key, enabled: true, updatedAt: null, updatedBy: null, updatedByName: null, note: null }] as const
  const qmsRows = async () => {
    const built = await buildMediaPlanWorkbook({
      header, mediaItems: aaItems(), mbaData: aaMba, variant: "aa", draft: false,
      clientName: "Acme", campaignName: "Visibility", versionNumber: 1,
    })
    return texts((await load(built.buffer)).getWorksheet("Media Plan")!).filter((t) => t === "QMS").length
  }
  try {
    setFeatureRowReaderForTests(async () => new Map([on("export_sheet_visibility")]))
    assert.equal(await qmsRows(), 0, "visibility alone leaves AA content as before")
    setFeatureRowReaderForTests(async () => new Map([on("aa_client_pays_lines")]))
    assert.equal(await qmsRows(), 1)
  } finally {
    setFeatureRowReaderForTests(null)
  }
})
