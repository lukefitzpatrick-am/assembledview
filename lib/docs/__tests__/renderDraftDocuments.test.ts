/**
 * DD-2 — draft documents render from the save body and write nothing.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import ExcelJS from "exceljs"

import { setFeatureRowReaderForTests } from "../../features/server.js"
import type { DraftDocumentsBody } from "../draftDocumentsBody.js"
import { renderDraftDocuments } from "../renderDraftDocuments.js"
import { pdfText } from "./pdfText.js"

function fixtureSaveBody(
  overrides: Partial<DraftDocumentsBody> = {}
): DraftDocumentsBody {
  return {
    mbaNumber: "draft001",
    versionNumber: 1,
    mode: "publish" as const,
    campaignName: "Draft Campaign",
    brand: "Brand",
    poNumber: "PO-1",
    campaignStartDate: "2026-01-01",
    campaignEndDate: "2026-01-31",
    lineItems: [
      {
        lineItemId: "search-1",
        channel: "search",
        mediaType: "search",
        rate: 1,
        enteredAmount: 5000,
        buyType: "cpc",
        publisher: "Google",
        platform: "Google",
        approval: "approved",
        bursts: [
          {
            startDate: "2026-01-01",
            endDate: "2026-01-31",
            budget: 5000,
          },
        ],
      },
    ],
    feeLoading: { feesearch: 10 },
    adservaudio: 0,
    adservvideo: 0,
    adservdisplay: 0,
    adservimp: 0,
    kind: "mba_pdf",
    clientAddress: {
      name: "Fixture Client",
      streetaddress: "1 Test St",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
    },
    campaignStatus: "Draft",
    ...overrides,
  } as DraftDocumentsBody
}

describe("renderDraftDocuments writes nothing", () => {
  it("does not import savePlan, Blob, or insert into Postgres", () => {
    const src = readFileSync(
      join(import.meta.dirname, "../renderDraftDocuments.ts"),
      "utf8"
    )
    assert.equal(src.includes("savePlanVersion"), false)
    assert.equal(src.includes("@vercel/blob"), false)
    assert.equal(src.includes("getDb"), false)
    assert.equal(src.includes(".insert("), false)
  })
})

describe("renderDraftDocuments MBA", () => {
  it("returns a DRAFT PDF with the stamp and no checksum footer", async () => {
    const result = await renderDraftDocuments(fixtureSaveBody())
    assert.equal(result.mime, "application/pdf")
    assert.match(result.filename, /^DRAFT - /)
    assert.match(result.filename, / - MBA - not for client\.pdf$/)
    const text = await pdfText(result.buffer)
    assert.ok(text.includes("DRAFT - NOT FOR CLIENT"))
    assert.equal(text.includes("v1 ·"), false)
  })
})

describe("renderDraftDocuments Media Plan", () => {
  it("returns a DRAFT workbook with header/footer stamp", async () => {
    const result = await renderDraftDocuments(
      fixtureSaveBody({ kind: "media_plan" })
    )
    assert.equal(
      result.mime,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert.match(result.filename, /^DRAFT - /)
    assert.match(result.filename, / - Media Plan - not for client\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(result.buffer as unknown as ExcelJS.Buffer)
    const sheet = wb.getWorksheet("Media Plan")
    assert.ok(sheet)
    assert.equal(
      sheet.headerFooter.oddHeader,
      `&C&"Aptos,Bold"&20DRAFT - NOT FOR CLIENT`
    )
  })
})

async function serviceFeeMonths(on: boolean): Promise<{ total: number; months: number[] }> {
  setFeatureRowReaderForTests(
    async () => new Map([["client_fee_rate_history", { key: "client_fee_rate_history", enabled: on, updatedAt: null, updatedBy: null, updatedByName: null, note: null }]])
  )
  try {
    const result = await renderDraftDocuments(
      fixtureSaveBody({
        kind: "media_plan",
        campaignEndDate: "2026-02-28",
        lineItems: [
          {
            lineItemId: "search-1",
            channel: "search",
            mediaType: "search",
            rate: 1,
            enteredAmount: 10000,
            buyType: "cpc",
            publisher: "Google",
            platform: "Google",
            approval: "approved",
            bursts: [
              { startDate: "2026-01-01", endDate: "2026-01-31", budget: 5000 },
              { startDate: "2026-02-01", endDate: "2026-02-28", budget: 5000 },
            ],
            feeOverride: {
              mode: "manual",
              months: [
                { month: "2026-01", amount: 0 },
                { month: "2026-02", amount: 1000 },
              ],
              dateBasis: "billing",
            },
          },
        ],
      } as Partial<DraftDocumentsBody>)
    )
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(result.buffer as unknown as ExcelJS.Buffer)
    const sheet = wb.getWorksheet("Media Plan")!
    let months: number[] = []
    let total = 0
    sheet.eachRow((row) => {
      if (String(row.getCell(2).value ?? "") !== "Service Fee") return
      total = Number(row.getCell(14).value)
      months = []
      row.eachCell((cell, col) => {
        // A merged month range reports its value on every cell; read its first cell only.
        if (col > 14 && cell.master.address === cell.address && typeof cell.value === "number") months.push(cell.value)
      })
    })
    return { total, months: months.filter((v) => v !== 0) }
  } finally {
    setFeatureRowReaderForTests(null)
  }
}

describe("renderDraftDocuments Media Plan: S4 fee months (client_fee_rate_history)", () => {
  it("switch on: the Service Fee row puts a fee moved to February in February only", async () => {
    const { total, months } = await serviceFeeMonths(true)
    assert.ok(total > 0)
    assert.deepEqual(months, [total])
  })

  it("switch off: the Service Fee row splits by delivery month, as before S4", async () => {
    const { total, months } = await serviceFeeMonths(false)
    assert.ok(total > 0)
    assert.equal(months.length, 2)
    assert.equal(months[0], months[1])
  })
})
