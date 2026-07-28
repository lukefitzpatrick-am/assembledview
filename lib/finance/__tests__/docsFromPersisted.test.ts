import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { buildMbaDataFromPersistedVersion } from "@/lib/finance/buildMbaDataFromPersistedVersion"
import { versionCarriesMbaApproval } from "@/lib/finance/mbaApprovalGate"
import {
  canonicalStableStringify,
  snapshotChecksum,
  snapshotChecksumShort,
} from "@/lib/finance/snapshotChecksum"
import { resolvePlanCDocsFromPersistedMode } from "@/lib/finance/planCDocsFromPersisted"
import { generateMBA } from "@/lib/generateMBA"

afterEach(() => {
  delete process.env.PLANC_DOCS_FROM_PERSISTED
})

function sampleBillingSchedule() {
  return [
    {
      monthYear: "June 2026",
      mediaTotal: "$10,000.00",
      feeTotal: "$2,000.00",
      totalAmount: "$12,000.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: {
        search: "$10,000.00",
        socialMedia: "$0.00",
        television: "$0.00",
        radio: "$0.00",
        newspaper: "$0.00",
        magazines: "$0.00",
        ooh: "$0.00",
        cinema: "$0.00",
        digiDisplay: "$0.00",
        digiAudio: "$0.00",
        digiVideo: "$0.00",
        bvod: "$0.00",
        integration: "$0.00",
        progDisplay: "$0.00",
        progVideo: "$0.00",
        progBvod: "$0.00",
        progAudio: "$0.00",
        progOoh: "$0.00",
        influencers: "$0.00",
        production: "$0.00",
      },
    },
  ]
}

function approvedVersion(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 42,
    version_number: 3,
    campaign_status: "approved",
    campaign_name: "Demo Campaign",
    brand: "Demo Brand",
    po_number: "PO-1",
    mp_client_name: "Acme",
    campaign_start_date: "2026-06-01",
    campaign_end_date: "2026-06-30",
    mp_search: true,
    billingSchedule: sampleBillingSchedule(),
    deliverySchedule: sampleBillingSchedule(),
    ...overrides,
  }
}

test("snapshotChecksum: stable stringify sorts keys; short is first 8 of sha256", () => {
  const a = snapshotChecksum({ b: 1, a: 2 })
  const b = snapshotChecksum({ a: 2, b: 1 })
  assert.equal(a, b)
  assert.equal(snapshotChecksumShort({ a: 2, b: 1 }), a.slice(0, 8))
  assert.equal(
    canonicalStableStringify({ z: 1, a: { d: 2, c: 3 } }),
    '{"a":{"c":3,"d":2},"z":1}'
  )
})

test("versionCarriesMbaApproval: approved status ok; draft without partial fails", () => {
  assert.equal(versionCarriesMbaApproval(approvedVersion()), true)
  assert.equal(
    versionCarriesMbaApproval(approvedVersion({ campaign_status: "draft" })),
    false
  )
  assert.equal(
    versionCarriesMbaApproval(
      approvedVersion({
        campaign_status: "draft",
        billingSchedule: [
          {
            ...sampleBillingSchedule()[0],
            partialApproval: { isPartial: true, selectedMonthYears: ["June 2026"] },
          },
        ],
      })
    ),
    true
  )
})

test("buildMbaDataFromPersistedVersion: totals from schedule; stamp uses checksum", () => {
  const asOf = new Date("2026-07-28T00:00:00.000Z")
  const built = buildMbaDataFromPersistedVersion({
    version: approvedVersion(),
    mbaNumber: "ACME001",
    clientAddress: {
      streetaddress: "1 Main St",
      suburb: "Sydney",
      state: "NSW",
      postcode: "2000",
    },
    asOfDate: asOf,
  })
  assert.equal(built.mbaData.totals.gross_media, 10000)
  assert.equal(built.mbaData.totals.service_fee, 2000)
  assert.equal(built.mbaData.totals.totals_ex_gst, 12000)
  assert.equal(built.mbaData.gross_media[0]?.media_type, "Search")
  assert.equal(built.mbaData.gross_media[0]?.gross_amount, 10000)
  assert.equal(built.mbaData.documentStamp, `v3 · ${built.checksumShort}`)
  assert.equal(built.checksumShort.length, 8)
})

test("flag on: identical PDF bytes for same version across two renders", async () => {
  const asOf = new Date("2026-07-28T12:00:00.000Z")
  const version = approvedVersion()
  const built = buildMbaDataFromPersistedVersion({
    version,
    mbaNumber: "ACME001",
    asOfDate: asOf,
  })
  const blob1 = await generateMBA(built.mbaData)
  const blob2 = await generateMBA(
    buildMbaDataFromPersistedVersion({
      version,
      mbaNumber: "ACME001",
      asOfDate: asOf,
    }).mbaData
  )
  const buf1 = Buffer.from(await blob1.arrayBuffer())
  const buf2 = Buffer.from(await blob2.arrayBuffer())
  assert.equal(buf1.equals(buf2), true)
  assert.ok(buf1.length > 500)
  // Footer stamp present in PDF content stream (ASCII)
  assert.ok(buf1.toString("latin1").includes(built.checksumShort))
})

test("resolvePlanCDocsFromPersistedMode: off by default; on when set", () => {
  assert.equal(resolvePlanCDocsFromPersistedMode(""), "off")
  assert.equal(resolvePlanCDocsFromPersistedMode("on"), "on")
})

test("flag off legacy path: MBAData from client body shape still renders", async () => {
  // Snapshot of legacy route mapping — totals come from body fields.
  const { generateMBA: gen } = await import("@/lib/generateMBA.js")
  const blob = await gen({
    date: "28/07/2026",
    mba_number: "LEGACY1",
    campaign_name: "Legacy",
    campaign_brand: "Brand",
    po_number: "",
    media_plan_version: "1",
    client: {
      name: "Client",
      streetaddress: "",
      suburb: "",
      state: "",
      postcode: "",
    },
    campaign: { date_start: "01/06/2026", date_end: "30/06/2026" },
    gross_media: [{ media_type: "Search", gross_amount: 1000 }],
    totals: {
      gross_media: 1000,
      service_fee: 200,
      production: 0,
      adserving: 0,
      totals_ex_gst: 1200,
      total_inc_gst: 1320,
    },
    billingSchedule: [{ monthYear: "June 2026", totalAmount: "$1,200.00" }],
  })
  const buf = Buffer.from(await blob.arrayBuffer())
  assert.ok(buf.length > 500)
  // No Plan C stamp on legacy
  assert.equal(buf.toString("latin1").includes(" · "), false)
})
