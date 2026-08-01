import assert from "node:assert/strict"
import { test } from "node:test"
import {
  applyPacingRowFilters,
  filterDirectCampaignGroups,
  isPacingClientFilterUnresolved,
  mapAdServingChannelFamilyToMediaType,
  mapAdServingStatusToBand,
  mapDirectStatusToBand,
  mapProgrammaticChannelFamilyToMediaType,
  type PacingRowFilterAccessors,
} from "@/lib/pacing/filters/applyPacingRowFilters"
import type { DirectCampaignGroup } from "@/lib/pacing/direct/types"
import type {
  AdServingChannelFamily,
  AdServingLineItemStatus,
} from "@/lib/pacing/ad-serving/types"
import type { ProgrammaticChannelFamily } from "@/lib/pacing/programmatic/types"
import type { DirectBurstStatus } from "@/lib/pacing/direct/types"

type Row = {
  clientName: string
  mediaType: string
  status: string
  searchText: string
}

const accessors: PacingRowFilterAccessors<Row> = {
  clientName: (r) => r.clientName,
  mediaType: (r) => r.mediaType,
  status: (r) => r.status as "behind" | "on-track" | "ahead" | "no-data",
  searchText: (r) => r.searchText,
}

const emptyFilters = {
  client_ids: [] as string[],
  media_types: [] as string[],
  statuses: [] as string[],
  search: "",
}

const clientIdToName = new Map<string, string>([
  ["1", "Acme Corp"],
  ["2", "Beta Co"],
])

const rows: Row[] = [
  {
    clientName: "Acme Corp",
    mediaType: "search",
    status: "behind",
    searchText: "Acme Corp Brand Campaign acme001SE1 acme001 exact match",
  },
  {
    clientName: "Beta Co",
    mediaType: "display",
    status: "on-track",
    searchText: "Beta Co Awareness beta001DI1 beta001 broad",
  },
  {
    clientName: "Acme Corp",
    mediaType: "video",
    status: "ahead",
    searchText: "Acme Corp Video Push acme001PV1 acme001 retarget",
  },
]

test("empty filters returns all rows", () => {
  const out = applyPacingRowFilters(rows, emptyFilters, accessors, clientIdToName)
  assert.equal(out.length, 3)
})

test("selected client_ids + empty map fails closed (zero rows, not all)", () => {
  const emptyMap = new Map<string, string>()
  assert.equal(isPacingClientFilterUnresolved(["1"], emptyMap), true)
  const out = applyPacingRowFilters(
    rows,
    { ...emptyFilters, client_ids: ["1"] },
    accessors,
    emptyMap,
  )
  assert.equal(out.length, 0)
  assert.notEqual(out.length, rows.length)
})

test("selected client_ids + empty map fails closed for direct groups", () => {
  const emptyMap = new Map<string, string>()
  const groups: DirectCampaignGroup[] = [
    {
      mbaNumber: "dir001",
      clientName: "Acme Corp",
      campaignName: "Fixed A",
      campaignStatus: "live",
      campaignStartDate: "2026-01-01",
      campaignEndDate: "2026-06-01",
      brand: null,
      lineItems: [
        {
          lineItemId: "dir001FC1",
          mbaNumber: "dir001",
          lineItemName: "Billboard",
          buyType: "fixed_cost",
          isCurrentlyFixedCost: true,
          wasEverFixedCost: true,
          totalBudget: 100,
          totalReported: 50,
          totalActual: 40,
          variance: 10,
          variancePct: 0.2,
          burstCount: 1,
          burstsDeliveredOver: 0,
          burstsDeliveredUnder: 1,
          lineItemStatus: "completed_under",
          bursts: [],
          daily: [],
        },
      ],
      totalBudget: 100,
      totalReported: 50,
      totalActual: 40,
      variance: 10,
    },
  ]
  const out = filterDirectCampaignGroups(
    groups,
    { ...emptyFilters, client_ids: ["1"] },
    emptyMap,
  )
  assert.equal(out.length, 0)
})

test("single client_id filters by resolved name (case-insensitive trim)", () => {
  const out = applyPacingRowFilters(
    [
      ...rows,
      {
        clientName: "  acme corp  ",
        mediaType: "search",
        status: "no-data",
        searchText: "trimmed",
      },
    ],
    { ...emptyFilters, client_ids: ["1"] },
    accessors,
    clientIdToName,
  )
  assert.equal(out.length, 3)
  assert.ok(out.every((r) => r.clientName.trim().toLowerCase() === "acme corp"))
})

test("multi media_types keeps matching rows", () => {
  const out = applyPacingRowFilters(
    rows,
    { ...emptyFilters, media_types: ["search", "video"] },
    accessors,
    clientIdToName,
  )
  assert.equal(out.length, 2)
  assert.deepEqual(
    out.map((r) => r.mediaType).sort(),
    ["search", "video"],
  )
})

test("multi statuses keeps matching rows", () => {
  const out = applyPacingRowFilters(
    rows,
    { ...emptyFilters, statuses: ["behind", "ahead"] },
    accessors,
    clientIdToName,
  )
  assert.equal(out.length, 2)
})

test("search is case-insensitive matchText over searchText", () => {
  const out = applyPacingRowFilters(
    rows,
    { ...emptyFilters, search: "RETARGET" },
    accessors,
    clientIdToName,
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].mediaType, "video")
})

test("stacked filters AND together; no-match returns empty", () => {
  const out = applyPacingRowFilters(
    rows,
    {
      client_ids: ["1"],
      media_types: ["search"],
      statuses: ["ahead"],
      search: "",
    },
    accessors,
    clientIdToName,
  )
  assert.equal(out.length, 0)
})

test("programmatic channelFamily maps to filter media values", () => {
  const cases: [ProgrammaticChannelFamily, string][] = [
    ["progDisplay", "display"],
    ["progVideo", "video"],
    ["progBvod", "bvod"],
    ["progAudio", "audio"],
    ["progOoh", "ooh"],
  ]
  for (const [family, expected] of cases) {
    assert.equal(mapProgrammaticChannelFamilyToMediaType(family), expected)
  }
})

test("ad-serving channelFamily maps to filter media values", () => {
  const cases: [AdServingChannelFamily, string][] = [
    ["digitalDisplay", "display"],
    ["digitalVideo", "video"],
    ["digitalAudio", "audio"],
    ["bvod", "bvod"],
  ]
  for (const [family, expected] of cases) {
    assert.equal(mapAdServingChannelFamilyToMediaType(family), expected)
  }
})

test("ad-serving status maps to 4 bands", () => {
  const cases: [AdServingLineItemStatus, string][] = [
    ["serving", "on-track"],
    ["no-data", "no-data"],
  ]
  for (const [raw, expected] of cases) {
    assert.equal(mapAdServingStatusToBand(raw), expected)
  }
})

test("direct status maps to 4 bands; mixed is no-data", () => {
  const cases: Array<[DirectBurstStatus | "mixed", string]> = [
    ["pending", "no-data"],
    ["in_progress", "on-track"],
    ["completed", "on-track"],
    ["completed_over", "ahead"],
    ["completed_under", "behind"],
    ["mixed", "no-data"],
  ]
  for (const [raw, expected] of cases) {
    assert.equal(mapDirectStatusToBand(raw), expected)
  }
})

test("filterDirectCampaignGroups drops failing line items and empty groups", () => {
  const groups: DirectCampaignGroup[] = [
    {
      mbaNumber: "dir001",
      clientName: "Acme Corp",
      campaignName: "Fixed A",
      campaignStatus: "live",
      campaignStartDate: "2026-01-01",
      campaignEndDate: "2026-06-01",
      brand: null,
      lineItems: [
        {
          lineItemId: "dir001FC1",
          mbaNumber: "dir001",
          lineItemName: "Billboard",
          buyType: "fixed_cost",
          isCurrentlyFixedCost: true,
          wasEverFixedCost: true,
          totalBudget: 100,
          totalReported: 50,
          totalActual: 40,
          variance: 10,
          variancePct: 0.2,
          burstCount: 1,
          burstsDeliveredOver: 0,
          burstsDeliveredUnder: 1,
          lineItemStatus: "completed_under",
          bursts: [],
          daily: [],
        },
        {
          lineItemId: "dir001FC2",
          mbaNumber: "dir001",
          lineItemName: "Transit",
          buyType: "fixed_cost",
          isCurrentlyFixedCost: true,
          wasEverFixedCost: true,
          totalBudget: 100,
          totalReported: 50,
          totalActual: 50,
          variance: 0,
          variancePct: 0,
          burstCount: 1,
          burstsDeliveredOver: 0,
          burstsDeliveredUnder: 0,
          lineItemStatus: "in_progress",
          bursts: [],
          daily: [],
        },
      ],
      totalBudget: 200,
      totalReported: 100,
      totalActual: 90,
      variance: 10,
    },
    {
      mbaNumber: "dir002",
      clientName: "Beta Co",
      campaignName: "Fixed B",
      campaignStatus: "live",
      campaignStartDate: "2026-01-01",
      campaignEndDate: "2026-06-01",
      brand: null,
      lineItems: [
        {
          lineItemId: "dir002FC1",
          mbaNumber: "dir002",
          lineItemName: "Cinema",
          buyType: "fixed_cost",
          isCurrentlyFixedCost: true,
          wasEverFixedCost: true,
          totalBudget: 100,
          totalReported: 100,
          totalActual: 100,
          variance: 0,
          variancePct: 0,
          burstCount: 1,
          burstsDeliveredOver: 0,
          burstsDeliveredUnder: 0,
          lineItemStatus: "completed",
          bursts: [],
          daily: [],
        },
      ],
      totalBudget: 100,
      totalReported: 100,
      totalActual: 100,
      variance: 0,
    },
  ]

  const out = filterDirectCampaignGroups(
    groups,
    { ...emptyFilters, statuses: ["behind"] },
    clientIdToName,
  )
  assert.equal(out.length, 1)
  assert.equal(out[0].mbaNumber, "dir001")
  assert.equal(out[0].lineItems.length, 1)
  assert.equal(out[0].lineItems[0].lineItemId, "dir001FC1")
})
