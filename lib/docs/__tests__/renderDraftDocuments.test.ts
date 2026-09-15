/**
 * DD-2 — draft documents render from the save body and write nothing.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import ExcelJS from "exceljs"

import type { DraftDocumentsBody } from "../draftDocumentsBody.js"
import { renderDraftDocuments } from "../renderDraftDocuments.js"

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
    assert.match(result.filename, /^DRAFT-MBA_/)
    assert.match(result.filename, /not-for-client\.pdf$/)
    const latin1 = result.buffer.toString("latin1")
    assert.ok(latin1.includes("DRAFT - NOT FOR CLIENT"))
    assert.equal(latin1.includes("v1 ·"), false)
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
    assert.match(result.filename, /^DRAFT-MediaPlan_/)
    assert.match(result.filename, /not-for-client\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(result.buffer as any)
    const sheet = wb.getWorksheet("Media Plan")
    assert.ok(sheet)
    assert.equal(
      sheet.headerFooter.oddHeader,
      `&C&"Arial,Bold"&20DRAFT - NOT FOR CLIENT`
    )
  })
})
