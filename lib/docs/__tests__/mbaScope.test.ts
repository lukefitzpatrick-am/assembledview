/**
 * Partial MBA scope line: media/months wording, filename, PDF header.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { ScheduleMonthRowInput } from "@/lib/finance/scheduleMonthsSource.js"
import { generateMBA, type MBAData } from "../../generateMBA.js"
import {
  deriveMbaScope,
  formatMbaScopeLine,
  mbaDocumentFilename,
} from "../mbaScope.js"
import { resolveMbaRenderFilters } from "../mbaRenderFilters.js"
import {
  canonicalSnapshotPayload,
  computeSnapshotChecksum,
  snapshotChecksumFooter,
} from "../snapshotChecksum.js"

function row(
  partial: Pick<
    ScheduleMonthRowInput,
    "lineItemId" | "component" | "basis" | "month" | "amountCents"
  > &
    Partial<ScheduleMonthRowInput>
): ScheduleMonthRowInput {
  return {
    versionId: 1,
    source: "computed",
    ...partial,
  }
}

function mediaRow(lineItemId: string, month: string, amountCents = 1_000_00) {
  return row({
    lineItemId,
    component: "media",
    basis: "billing",
    month,
    amountCents,
  })
}

const MONTHS = ["2026-07-01", "2026-08-01", "2026-09-01"] as const
const RADIO_IDS = [
  "billing-radio::R1",
  "billing-radio::R2",
  "billing-radio::R3",
  "billing-radio::R4",
]
const OTHER_IDS = ["billing-television::T1", "billing-search::S1"]
const ALL_IDS = [...RADIO_IDS, ...OTHER_IDS]

function grid(ids: readonly string[]) {
  return ids.flatMap((id) => MONTHS.map((month) => mediaRow(id, month)))
}

function fixtureMbaData(overrides: Partial<MBAData> = {}): MBAData {
  const hash = computeSnapshotChecksum({
    scheduleMonths: [
      {
        lineItemId: "billing-search::a",
        component: "media",
        basis: "billing",
        month: "2026-01-01",
        amountCents: 10000,
        source: "computed",
      },
      {
        lineItemId: "billing-search::a",
        component: "fee",
        basis: "billing",
        month: "2026-01-01",
        amountCents: 1000,
        source: "computed",
      },
    ],
    approvedSlice: {
      totalCents: 11000,
      lines: [
        {
          lineItemId: "billing-search::a",
          months: ["2026-01"],
          mediaCents: 10000,
          feeCents: 1000,
          adservingCents: 0,
          productionCents: 0,
        },
      ],
    },
    feeSnapshot: { search: 10 },
  })
  return {
    date: "15/01/2026",
    mba_number: "fixture001",
    campaign_name: "Fixture Campaign",
    campaign_brand: "Brand",
    po_number: "PO-1",
    media_plan_version: "2",
    client: {
      name: "Fixture Client",
      streetaddress: "1 Test St",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
    },
    campaign: { date_start: "01/01/2026", date_end: "31/01/2026" },
    gross_media: [{ media_type: "Search", gross_amount: 100 }],
    totals: {
      gross_media: 100,
      service_fee: 10,
      production: 0,
      adserving: 0,
      totals_ex_gst: 110,
      total_inc_gst: 121,
    },
    billingSchedule: [{ monthYear: "January 2026", totalAmount: "110" }],
    checksumFooter: snapshotChecksumFooter(2, hash),
    ...overrides,
  }
}

const RADIO_SEPTEMBER_LINE =
  "Scope: Partial MBA — Radio only · September 2026 only (4 of 6 lines)"
const MONTHS_ONLY_LINE =
  "Scope: Partial MBA — all media · September 2026 only (6 of 6 lines)"

describe("deriveMbaScope / formatMbaScopeLine", () => {
  it("radio-only, September-only → exact scope string", () => {
    const scheduleRows = grid(ALL_IDS)
    const filters = resolveMbaRenderFilters({
      frozenSlice: {
        lines: ALL_IDS.map((lineItemId) => ({
          lineItemId,
          months: ["2026-07", "2026-08", "2026-09"],
        })),
      },
      liveSelection: {
        approvedLineItemIds: RADIO_IDS,
        selectedMonthYears: ["September 2026"],
      },
    })
    const scope = deriveMbaScope({
      scheduleRows,
      filters,
      grossMedia: [{ media_type: "Radio" }],
      includedMonths: ["September 2026"],
    })
    assert.equal(scope.partial, true)
    assert.deepEqual(scope.includedMediaTypes, ["Radio"])
    assert.deepEqual(scope.excludedMediaTypes, ["Television", "Search"])
    assert.deepEqual(scope.includedMonths, ["September 2026"])
    assert.deepEqual(scope.excludedMonths, ["July 2026", "August 2026"])
    assert.equal(scope.includedLineCount, 4)
    assert.equal(scope.totalLineCount, 6)
    assert.equal(formatMbaScopeLine(scope), RADIO_SEPTEMBER_LINE)
  })

  it("persisted partial slice with no live overlay is still partial", () => {
    const scheduleRows = grid(ALL_IDS)
    const filters = resolveMbaRenderFilters({
      frozenSlice: {
        lines: RADIO_IDS.map((lineItemId) => ({
          lineItemId,
          months: ["2026-09"],
        })),
      },
    })
    const scope = deriveMbaScope({
      scheduleRows,
      filters,
      grossMedia: [{ media_type: "Radio" }],
      includedMonths: ["September 2026"],
    })
    assert.equal(filters.liveOverlay, false)
    assert.equal(scope.partial, true)
    assert.equal(formatMbaScopeLine(scope), RADIO_SEPTEMBER_LINE)
  })

  it("months excluded but all lines included → all media · September 2026 only", () => {
    const scheduleRows = grid(ALL_IDS)
    const filters = resolveMbaRenderFilters({
      frozenSlice: {
        lines: ALL_IDS.map((lineItemId) => ({
          lineItemId,
          months: ["2026-07", "2026-08", "2026-09"],
        })),
      },
      liveSelection: { selectedMonthYears: ["September 2026"] },
    })
    const scope = deriveMbaScope({
      scheduleRows,
      filters,
      grossMedia: [
        { media_type: "Television" },
        { media_type: "Radio" },
        { media_type: "Search" },
      ],
      includedMonths: ["September 2026"],
    })
    assert.equal(scope.partial, true)
    assert.equal(scope.includedLineCount, 6)
    assert.equal(scope.totalLineCount, 6)
    assert.deepEqual(scope.excludedMediaTypes, [])
    assert.equal(formatMbaScopeLine(scope), MONTHS_ONLY_LINE)
  })

  it("full MBA is not partial and draws no scope line", () => {
    const scheduleRows = grid(ALL_IDS)
    const filters = resolveMbaRenderFilters({
      frozenSlice: {
        lines: ALL_IDS.map((lineItemId) => ({
          lineItemId,
          months: ["2026-07", "2026-08", "2026-09"],
        })),
      },
    })
    const scope = deriveMbaScope({
      scheduleRows,
      filters,
      grossMedia: [
        { media_type: "Television" },
        { media_type: "Radio" },
        { media_type: "Search" },
      ],
      includedMonths: ["July 2026", "August 2026", "September 2026"],
    })
    assert.equal(scope.partial, false)
    assert.equal(formatMbaScopeLine(scope), null)
    assert.equal(
      mbaDocumentFilename({
        clientName: "Fixture Client",
        campaignName: "Fixture Campaign",
        versionNumber: 2,
        partial: false,
      }),
      "MBA_Fixture_Client_Fixture_Campaign_v2.pdf"
    )
  })
})

describe("mbaDocumentFilename", () => {
  it("appends _partial before .pdf when partial", () => {
    assert.equal(
      mbaDocumentFilename({
        clientName: "Fixture Client",
        campaignName: "Fixture Campaign",
        versionNumber: 2,
        partial: true,
      }),
      "MBA_Fixture_Client_Fixture_Campaign_v2_partial.pdf"
    )
  })
})

describe("checksum ignores scope", () => {
  it("canonical payload has no scope field", () => {
    const parsed = JSON.parse(
      canonicalSnapshotPayload({
        scheduleMonths: [
          {
            lineItemId: "billing-radio::R1",
            component: "media",
            basis: "billing",
            month: "2026-09-01",
            amountCents: 1000,
            source: "computed",
          },
        ],
        approvedSlice: { totalCents: 1000, lines: [] },
        feeSnapshot: null,
      })
    ) as Record<string, unknown>
    assert.deepEqual(Object.keys(parsed).sort(), [
      "approved_slice",
      "fee_snapshot",
      "schedule_months",
    ])
    assert.equal("scope" in parsed, false)
  })
})

describe("generateMBA scope header", () => {
  it("embeds the radio/September scope string on a partial MBA", async () => {
    const data = fixtureMbaData({
      scope: {
        partial: true,
        includedMediaTypes: ["Radio"],
        excludedMediaTypes: ["Television", "Search"],
        includedMonths: ["September 2026"],
        excludedMonths: ["July 2026", "August 2026"],
        includedLineCount: 4,
        totalLineCount: 6,
      },
    })
    const buf = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const latin1 = buf.toString("latin1")
    assert.ok(latin1.includes("Scope: Partial MBA"))
    assert.ok(latin1.includes("Radio only"))
    assert.ok(latin1.includes("September 2026 only"))
    assert.ok(latin1.includes("4 of 6 lines"))
    assert.equal(formatMbaScopeLine(data.scope), RADIO_SEPTEMBER_LINE)
  })

  it("full MBA fixture stays byte-identical and has no scope line", async () => {
    const data = fixtureMbaData()
    const withFalseScope = fixtureMbaData({
      scope: {
        partial: false,
        includedMediaTypes: ["Search"],
        excludedMediaTypes: [],
        includedMonths: ["January 2026"],
        excludedMonths: [],
        includedLineCount: 1,
        totalLineCount: 1,
      },
    })
    const a = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const b = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const c = Buffer.from(await (await generateMBA(withFalseScope)).arrayBuffer())
    const latin1 = a.toString("latin1")
    assert.equal(latin1.includes("Partial MBA"), false)
    assert.equal(latin1.includes("Scope:"), false)
    assert.ok(a.equals(b), "same full MBAData must stay byte-identical")
    assert.ok(a.equals(c), "scope.partial false must not change PDF bytes")
  })
})
