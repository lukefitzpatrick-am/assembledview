/**
 * Building a pack writes a draft row and one item per selected version.
 * Marking it sent stamps status, sent_at and sent_by. A sent membership
 * drops those versions from the due list; a draft membership does not.
 */
import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import JSZip from "jszip"

import { buildBillingPartnerPack } from "@/lib/finance/billingPartner/buildPack"
import { markPackSent, type PackSentUpdate } from "@/lib/finance/billingPartner/packStore"
import {
  selectDueAaPlans,
  type DueAaPlan,
  type PackMembership,
  type PublishedAaCandidate,
} from "@/lib/finance/billingPartner/duePlans"

const NOW = new Date("2026-10-19T07:00:00.000Z")

function plan(overrides: Partial<DueAaPlan> & Pick<DueAaPlan, "versionId" | "mbaNumber">): DueAaPlan {
  return {
    clientName: "Krusty",
    campaignName: "Spring",
    versionNumber: 6,
    publishedAt: "2026-10-19T02:00:00.000Z",
    publishedBy: "planner@assembledmedia.com.au",
    changeKind: "new",
    monthsChanged: null,
    comparedTo: null,
    backDated: false,
    aaMonthTotals: { "2026-11": 1200 },
    ...overrides,
  }
}

const DUE: DueAaPlan[] = [
  plan({
    versionId: 11,
    mbaNumber: "KRUSTY002",
    versionNumber: 6,
    changeKind: "amended",
    monthsChanged: ["2026-10", "2026-11"],
    comparedTo: { versionNumber: 5, basis: "previous_published" },
    backDated: true,
  }),
  plan({
    versionId: 22,
    mbaNumber: "HEMA007",
    clientName: "Hema",
    campaignName: "Always on",
    versionNumber: 2,
    changeKind: "new",
    monthsChanged: null,
    backDated: false,
    aaMonthTotals: { "2026-11": 80, "2026-12": 40 },
  }),
]

test("build creates a draft pack with the selected items and a summary workbook", async () => {
  const written: Array<{
    billingMonth: string
    status: "draft"
    createdBy: string
    blobPathname: string
    items: Array<{
      mbaNumber: string
      versionId: number
      versionNumber: number
      changeKind: string
      monthsChanged: string[] | null
      backDated: boolean
    }>
  }> = []
  const stored: { fileName: string; byteLength: number }[] = []

  const built = await buildBillingPartnerPack(
    {
      billingMonth: "2026-11",
      versionIds: [22, 11],
      createdBy: "luke@assembledmedia.com.au",
      now: NOW,
    },
    {
      listDue: async () => DUE,
      renderAa: async (row) => ({
        buffer: Buffer.from(`workbook-${row.mbaNumber}`),
        fileName: `${row.mbaNumber}-v${row.versionNumber}.xlsx`,
      }),
      storeZip: async (fileName, buffer) => {
        stored.push({ fileName, byteLength: buffer.length })
        return { pathname: `exports/billing-partner/${fileName}` }
      },
      insertDraft: async (row) => {
        written.push(row)
        return { id: "pack-1" }
      },
    },
  )

  assert.equal(built.packId, "pack-1")
  assert.equal(built.fileName, "AA pack November 2026 2026-10-19.zip")
  const pack = written[0]
  assert.ok(pack)
  assert.equal(pack.status, "draft")
  assert.equal(pack.billingMonth, "2026-11-01")
  assert.equal(pack.createdBy, "luke@assembledmedia.com.au")
  assert.equal(pack.blobPathname, "exports/billing-partner/AA pack November 2026 2026-10-19.zip")
  assert.deepEqual(
    pack.items.map((item) => item.versionId),
    [11, 22],
  )
  assert.equal(pack.items[0]?.changeKind, "amended")
  assert.deepEqual(pack.items[0]?.monthsChanged, ["2026-10", "2026-11"])
  assert.equal(pack.items[0]?.backDated, true)
  assert.equal(pack.items[1]?.changeKind, "new")
  assert.equal(pack.items[1]?.monthsChanged, null)
  assert.equal(stored.length, 1)

  const zip = await JSZip.loadAsync(built.buffer)
  const names = Object.keys(zip.files).sort()
  assert.deepEqual(names, [
    "AA pack summary November 2026.xlsx",
    "HEMA007-v2.xlsx",
    "KRUSTY002-v6.xlsx",
  ])
  const summary = await zip.file("AA pack summary November 2026.xlsx")!.async("nodebuffer")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(summary as unknown as ExcelJS.Buffer)
  const sheet = workbook.getWorksheet("Summary")
  assert.ok(sheet)
  assert.equal(sheet!.getRow(1).getCell(1).value, "Client")
  assert.equal(sheet!.getRow(1).getCell(8).value, "AA total 2026-11")
  assert.equal(sheet!.getRow(1).getCell(9).value, "AA total 2026-12")
  assert.equal(sheet!.getRow(2).getCell(3).value, "KRUSTY002")
  assert.equal(sheet!.getRow(2).getCell(5).value, "Amended")
  assert.equal(sheet!.getRow(2).getCell(6).value, "2026-10, 2026-11 vs v5 (pre-pack)")
  assert.equal(sheet!.getRow(2).getCell(7).value, "Yes")
  assert.equal(sheet!.getRow(2).getCell(8).value, 1200)
  assert.equal(sheet!.getRow(3).getCell(6).value, "Not available")
  assert.equal(sheet!.getRow(3).getCell(7).value, "No")
  assert.equal(sheet!.getRow(3).getCell(9).value, 40)
})

test("omitted version ids pack every plan that is due", async () => {
  let ids: number[] = []
  await buildBillingPartnerPack(
    { billingMonth: "2026-11-01", createdBy: "luke@assembledmedia.com.au", now: NOW },
    {
      listDue: async () => DUE,
      renderAa: async (row) => ({ buffer: Buffer.from("x"), fileName: `${row.mbaNumber}.xlsx` }),
      storeZip: async () => ({ pathname: "exports/billing-partner/pack.zip" }),
      insertDraft: async (row) => {
        ids = row.items.map((item) => item.versionId)
        return { id: "pack-2" }
      },
    },
  )
  assert.deepEqual(ids, [11, 22])
})

test("a version that is not due is refused", async () => {
  await assert.rejects(
    () =>
      buildBillingPartnerPack(
        { billingMonth: "2026-11", versionIds: [99], createdBy: "luke@assembledmedia.com.au", now: NOW },
        {
          listDue: async () => DUE,
          renderAa: async () => {
            throw new Error("should not render")
          },
          storeZip: async () => {
            throw new Error("should not store")
          },
          insertDraft: async () => {
            throw new Error("should not insert")
          },
        },
      ),
    /not due/,
  )
})

test("mark sent changes status, sent_at and sent_by", async () => {
  const updates: PackSentUpdate[] = []
  const row = await markPackSent(
    { packId: "pack-1", sentBy: "luke@assembledmedia.com.au", now: NOW },
    {
      markSent: async (update) => {
        updates.push(update)
        return update
      },
    },
  )
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0], {
    packId: "pack-1",
    status: "sent",
    sentAt: NOW.toISOString(),
    sentBy: "luke@assembledmedia.com.au",
  })
  assert.equal(row.status, "sent")
})

test("a sent pack's versions are no longer due", () => {
  const version: PublishedAaCandidate = {
    mbaNumber: "KRUSTY002",
    clientName: "Krusty",
    campaignName: "Spring",
    versionId: 11,
    versionNumber: 6,
    masterId: 1,
    publishedAt: "2026-10-19T02:00:00.000Z",
    publishedBy: "planner@assembledmedia.com.au",
    firstPublishedAt: "2026-10-19T02:00:00.000Z",
    isAaPlan: true,
  }
  const draft: PackMembership = {
    versionId: 11,
    mbaNumber: "KRUSTY002",
    status: "draft",
    billingMonth: "2026-11-01",
    sentAt: null,
  }
  const stillDue = selectDueAaPlans({
    billingMonth: "2026-11-01",
    versions: [version],
    packs: [draft],
    scheduleMonths: [],
  })
  assert.equal(stillDue.length, 1)

  const sent: PackMembership = {
    ...draft,
    status: "sent",
    sentAt: NOW.toISOString(),
  }
  const after = selectDueAaPlans({
    billingMonth: "2026-11-01",
    versions: [version],
    packs: [sent],
    scheduleMonths: [],
  })
  assert.deepEqual(after, [])
})
