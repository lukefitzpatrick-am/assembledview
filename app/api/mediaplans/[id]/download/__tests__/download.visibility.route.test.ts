/**
 * S15: the plan download and the AA render routes filter a workbook to the
 * caller's audience when export_sheet_visibility is on. Only admin keeps
 * every sheet. Requires Node 22+ module mocks.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import ExcelJS from "exceljs"
import { NextRequest, NextResponse } from "next/server"

import { mockModuleSkip, supportsMockModule } from "../../../../../../lib/test/mockModuleHarness.js"
import { generateMediaPlan } from "@/lib/generateMediaPlan"
import type { MediaItems } from "@/lib/generateMediaPlan"

const skip = mockModuleSkip()

type Access = { ok: true; isClient: boolean; isAdmin?: true } | { ok: false; response: NextResponse }
let access: Access = { ok: true, isClient: true }
let switchOn = true
let aaBytes: Buffer = Buffer.alloc(0)

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const servePlanFileAttachmentMock = mock.fn(async (file: unknown) => {
  const pdf = (file as { name?: string }).name === "mba.pdf"
  return new NextResponse(new Uint8Array(pdf ? Buffer.from("%PDF") : aaBytes), {
    status: 200,
    headers: {
      "Content-Type": pdf ? "application/pdf" : XLSX,
      "Content-Disposition": `attachment; filename="${pdf ? "mba.pdf" : "Acme_AA_v1.xlsx"}"`,
    },
  })
})

if (supportsMockModule()) {
  await mock.module!("@/lib/auth/checkClientMbaAccess", {
    namedExports: { checkClientMbaAccess: async () => access },
  })
  await mock.module!("@/lib/features/server", {
    namedExports: { isFeatureOn: async (key: string) => key === "export_sheet_visibility" && switchOn },
  })
  await mock.module!("@/lib/docs/readPublishedVersionDocuments", {
    namedExports: {
      readVersionForDownload: async () => ({
        id: 42,
        mbaNumber: "acme001",
        versionNumber: 1,
        publishedAt: "2026-09-05T04:00:00.000Z",
        mbaPdfFile: { url: "https://blob.vercel-storage.com/mba.pdf", pathname: "mba.pdf", name: "mba.pdf" },
        mediaPlanFile: null,
        aaMediaPlanFile: { url: "https://blob.vercel-storage.com/aa.xlsx", pathname: "aa.xlsx", name: "aa.xlsx" },
      }),
    },
  })
  await mock.module!("@/lib/docs/servePlanFile", {
    namedExports: { servePlanFileAttachment: servePlanFileAttachmentMock },
  })
  await mock.module!("@/lib/docs/renderPlanVersionDocuments", {
    namedExports: {
      renderPlanVersionDocuments: async () => ({
        status: "ok" as const,
        results: [{ kind: "aa_media_plan" as const, status: "written" as const }],
        files: { aa_media_plan: { kind: "aa_media_plan", filename: "aa.xlsx", mime: XLSX, buffer: aaBytes } },
        generatedFrom: { aa_media_plan: "persisted" as const },
      }),
    },
  })
}

async function buildAa(): Promise<Buffer> {
  const keys = ["search", "socialMedia", "digiAudio", "digiDisplay", "digiVideo", "bvod", "progDisplay", "progVideo", "progBvod", "progOoh", "progAudio", "newspaper", "magazines", "television", "radio", "ooh", "cinema", "integration", "influencers", "production"]
  const items = Object.fromEntries(keys.map((k) => [k, []])) as unknown as MediaItems
  items.ooh = [{
    market: "Sydney", network: "JCDecaux", oohFormat: "large_format", startDate: "2026-10-01", endDate: "2026-10-31",
    deliverables: 1, buyType: "panels", deliverablesAmount: "1000", grossMedia: "1000", line_item_id: "OH1", buyAmount: "1000",
  }]
  const wb = await generateMediaPlan(
    {
      logoBase64: "", logoWidth: 0, logoHeight: 0, client: "Acme", brand: "Acme", campaignName: "C", mbaNumber: "ACME001",
      clientContact: "", planVersion: "1", poNumber: "", campaignBudget: "$1,000.00", campaignStatus: "approved",
      campaignStart: "01/10/2026", campaignEnd: "31/10/2026",
    },
    items,
    { gross_media: [{ media_type: "OOH", gross_amount: 1000 }], totals: { gross_media: 1000, service_fee: 0, production: 0, adserving: 0, totals_ex_gst: 1000, total_inc_gst: 1100 } },
    { mbaTotalsLayout: "aa", asOf: new Date("2026-10-19T00:00:00.000Z") },
  )
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}

async function sheetNames(res: Response): Promise<string[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load((await res.arrayBuffer()) as ArrayBuffer)
  return wb.worksheets.map((ws) => ws.name)
}

const ALL = ["Media Plan", "Monthly by supplier", "Insertions"]
const CLIENT = ["Media Plan", "Insertions"]

async function download(kind: string): Promise<Response> {
  const { GET } = await import("../route.js")
  const url = new URL("http://localhost/api/mediaplans/42/download")
  url.searchParams.set("kind", kind)
  return GET(new NextRequest(url), { params: Promise.resolve({ id: "42" }) })
}

async function render(): Promise<Response> {
  const { POST } = await import("../../aa-workbook/route.js")
  return POST(new NextRequest("http://localhost/api/mediaplans/42/aa-workbook", { method: "POST" }), {
    params: Promise.resolve({ id: "42" }),
  })
}

test("switch on: a client download of the AA workbook leaves out Monthly by supplier", { skip }, async () => {
  aaBytes = await buildAa()
  access = { ok: true, isClient: true }
  switchOn = true
  const res = await download("aa_media_plan")
  assert.equal(res.status, 200)
  assert.match(res.headers.get("Content-Disposition") ?? "", /Acme_AA_v1\.xlsx/)
  const body = await res.clone().arrayBuffer()
  assert.equal(res.headers.get("Content-Length"), String(body.byteLength))
  assert.deepEqual(await sheetNames(res), CLIENT)
})

test("switch on: a non-admin with no client role is still the client audience", { skip }, async () => {
  aaBytes = await buildAa()
  access = { ok: true, isClient: false }
  switchOn = true
  assert.deepEqual(await sheetNames(await download("aa_media_plan")), CLIENT)
})

test("switch on: admin keeps every sheet", { skip }, async () => {
  aaBytes = await buildAa()
  access = { ok: true, isClient: false, isAdmin: true }
  switchOn = true
  assert.deepEqual(await sheetNames(await download("aa_media_plan")), ALL)
})

test("switch off: a client gets the whole stored workbook, as before", { skip }, async () => {
  aaBytes = await buildAa()
  access = { ok: true, isClient: true }
  switchOn = false
  assert.deepEqual(await sheetNames(await download("aa_media_plan")), ALL)
})

test("switch on: the MBA PDF passes through untouched for a client", { skip }, async () => {
  access = { ok: true, isClient: true }
  switchOn = true
  const res = await download("mba_pdf")
  assert.equal(res.status, 200)
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "%PDF")
})

test("a denied tenant never reaches the file", { skip }, async () => {
  servePlanFileAttachmentMock.mock.resetCalls()
  access = { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  switchOn = true
  const res = await download("aa_media_plan")
  assert.equal(res.status, 403)
  assert.equal(servePlanFileAttachmentMock.mock.calls.length, 0)
})

test("AA render route: switch on filters for a client, keeps every sheet for admin and when off", { skip }, async () => {
  aaBytes = await buildAa()
  switchOn = true
  access = { ok: true, isClient: true }
  assert.deepEqual(await sheetNames(await render()), CLIENT)
  access = { ok: true, isClient: false, isAdmin: true }
  assert.deepEqual(await sheetNames(await render()), ALL)
  switchOn = false
  access = { ok: true, isClient: true }
  assert.deepEqual(await sheetNames(await render()), ALL)
})
