/**
 * SM-5 — Generate MBA uses live form campaign dates when they differ from the
 * saved row, with a watermark. Independent of Partial MBA overlay (MBA-LIVE-2).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { generateMBA, type MBAData } from "../../generateMBA.js"
import { deriveLiveMbaScopeSelection } from "../liveMbaScopeSelection.js"
import {
  liveCampaignDatesIfChanged,
  mbaCampaignDateFields,
} from "../liveCampaignDates.js"
import { parseMbaGenerateBody } from "../mbaGenerateBody.js"
import { resolveMbaRenderFilters } from "../mbaRenderFilters.js"
import {
  canonicalSnapshotPayload,
  computeSnapshotChecksum,
} from "../snapshotChecksum.js"

const here = dirname(fileURLToPath(import.meta.url))
const builderSrc = readFileSync(join(here, "../buildMbaFromPersisted.ts"), "utf8")
const routeSrc = readFileSync(
  join(here, "../../../app/api/mba/generate/route.ts"),
  "utf8"
)
const editSrc = readFileSync(
  join(here, "../../../app/mediaplans/mba/[mba_number]/edit/page.tsx"),
  "utf8"
)
const createSrc = readFileSync(
  join(here, "../../../app/mediaplans/create/page.tsx"),
  "utf8"
)
const generateMbaSrc = readFileSync(join(here, "../../generateMBA.ts"), "utf8")
const filtersSrc = readFileSync(join(here, "../mbaRenderFilters.ts"), "utf8")
const liveScopeSrc = readFileSync(join(here, "../liveMbaScopeSelection.ts"), "utf8")

function fixtureMbaData(overrides: Partial<MBAData> = {}): MBAData {
  return {
    date: "05/09/2026",
    mba_number: "dates001",
    campaign_name: "Dates Campaign",
    campaign_brand: "Brand",
    po_number: "PO-1",
    media_plan_version: "1",
    client: {
      name: "Fixture Client",
      streetaddress: "1 Test St",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
    },
    campaign: { date_start: "01/01/2026", date_end: "31/12/2026" },
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
    ...overrides,
  }
}

describe("liveCampaignDatesIfChanged", () => {
  it("returns ISO dates when the form end date differs from the persisted row", () => {
    assert.deepEqual(
      liveCampaignDatesIfChanged({
        formStart: "2026-01-01",
        formEnd: "2026-11-30",
        persistedStart: "2026-01-01",
        persistedEnd: "2026-12-31",
      }),
      { start: "2026-01-01", end: "2026-11-30" }
    )
  })

  it("returns undefined when Melbourne-normalised form dates match the saved row", () => {
    assert.equal(
      liveCampaignDatesIfChanged({
        formStart: new Date("2026-01-01T00:00:00+11:00"),
        formEnd: new Date("2026-12-31T00:00:00+11:00"),
        persistedStart: "2026-01-01",
        persistedEnd: "2026-12-31",
      }),
      undefined
    )
  })

  it("returns undefined when either form date cannot be normalised", () => {
    assert.equal(
      liveCampaignDatesIfChanged({
        formStart: "2026-01-01",
        formEnd: null,
        persistedStart: "2026-01-01",
        persistedEnd: "2026-12-31",
      }),
      undefined
    )
  })
})

describe("mbaCampaignDateFields", () => {
  it("prints live dates and datesUnsaved when liveCampaignDates is present", () => {
    assert.deepEqual(
      mbaCampaignDateFields({
        persistedStart: "2026-01-01",
        persistedEnd: "2026-12-31",
        liveCampaignDates: { start: "2026-02-01", end: "2026-11-30" },
      }),
      {
        date_start: "01/02/2026",
        date_end: "30/11/2026",
        datesUnsaved: true,
      }
    )
  })

  it("prints persisted dates and datesUnsaved false when live dates are absent", () => {
    assert.deepEqual(
      mbaCampaignDateFields({
        persistedStart: "2026-01-01",
        persistedEnd: "2026-12-31",
      }),
      {
        date_start: "01/01/2026",
        date_end: "31/12/2026",
        datesUnsaved: false,
      }
    )
  })
})

describe("parseMbaGenerateBody liveCampaignDates", () => {
  const identifiers = { mba_number: "bica001", version_number: 22 }

  it("accepts liveCampaignDates without overlay keys (full MBA)", () => {
    const parsed = parseMbaGenerateBody({
      ...identifiers,
      liveCampaignDates: { start: "2026-02-01", end: "2026-11-30" },
    })
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    assert.deepEqual(parsed.liveCampaignDates, {
      start: "2026-02-01",
      end: "2026-11-30",
    })
    assert.equal(parsed.liveSelection, undefined)
  })

  it("rejects extra body keys with CLIENT_TOTALS_REJECTED", () => {
    const parsed = parseMbaGenerateBody({
      ...identifiers,
      liveCampaignDates: { start: "2026-02-01", end: "2026-11-30" },
      totals_ex_gst: 999,
    })
    assert.equal(parsed.ok, false)
    if (parsed.ok) return
    assert.equal(parsed.status, 400)
    assert.equal(parsed.payload.code, "CLIENT_TOTALS_REJECTED")
    assert.deepEqual(parsed.payload.extra_keys, ["totals_ex_gst"])
  })

  it("rejects malformed liveCampaignDates", () => {
    const parsed = parseMbaGenerateBody({
      ...identifiers,
      liveCampaignDates: { start: "01/02/2026", end: "2026-11-30" },
    })
    assert.equal(parsed.ok, false)
    if (parsed.ok) return
    assert.equal(parsed.status, 400)
    assert.equal(parsed.payload.code, "BAD_REQUEST")
  })
})

describe("full MBA + live dates does not set liveOverlay", () => {
  it("deriveLiveMbaScopeSelection stays null for a full MBA", () => {
    assert.equal(
      deriveLiveMbaScopeSelection({
        isPartialMBA: false,
        allChannelsHydrated: true,
        lineItems: [{ lineItemId: "billing-search::SE1", approval: "approved" }],
        selectedMonthYears: ["August 2026"],
      }),
      null
    )
  })

  it("resolveMbaRenderFilters stays liveOverlay false when only live dates exist", () => {
    const parsed = parseMbaGenerateBody({
      mba_number: "bica001",
      version_number: 1,
      liveCampaignDates: { start: "2026-02-01", end: "2026-11-30" },
    })
    assert.equal(parsed.ok, true)
    if (!parsed.ok) return
    const filters = resolveMbaRenderFilters({
      frozenSlice: { lines: [] },
      liveSelection: parsed.liveSelection,
    })
    assert.equal(filters.liveOverlay, false)
    assert.deepEqual(parsed.liveCampaignDates, {
      start: "2026-02-01",
      end: "2026-11-30",
    })
  })

  it("LiveMbaSelection type stays overlay keys only", () => {
    assert.match(filtersSrc, /export type LiveMbaSelection = \{/)
    assert.doesNotMatch(filtersSrc, /liveCampaignDates/)
    assert.doesNotMatch(liveScopeSrc, /liveCampaignDates/)
  })
})

describe("generateMBA datesUnsaved watermark", () => {
  it("prints live campaign dates and the unsaved watermark", async () => {
    const data = fixtureMbaData({
      campaign: { date_start: "01/02/2026", date_end: "30/11/2026" },
      datesUnsaved: true,
    })
    const buf = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const latin1 = buf.toString("latin1")
    assert.ok(latin1.includes("Campaign Dates: From 01/02/2026 to 30/11/2026"))
    assert.ok(latin1.includes("Dates as edited in the plan"))
    assert.ok(latin1.includes("not yet saved"))
  })

  it("omits the watermark and stays byte-identical when datesUnsaved is absent", async () => {
    const data = fixtureMbaData()
    const withFalse = fixtureMbaData({ datesUnsaved: false })
    const a = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const b = Buffer.from(await (await generateMBA(data)).arrayBuffer())
    const c = Buffer.from(await (await generateMBA(withFalse)).arrayBuffer())
    const latin1 = a.toString("latin1")
    assert.ok(latin1.includes("Campaign Dates: From 01/01/2026 to 31/12/2026"))
    assert.equal(latin1.includes("Dates as edited in the plan"), false)
    assert.equal(latin1.includes("not yet saved"), false)
    assert.ok(a.equals(b), "same MBAData must stay byte-identical")
    assert.ok(a.equals(c), "datesUnsaved false must not change PDF bytes")
  })
})

describe("checksum ignores live campaign dates", () => {
  it("canonical payload has no datesUnsaved or campaign date fields", () => {
    const parsed = JSON.parse(
      canonicalSnapshotPayload({
        scheduleMonths: [
          {
            lineItemId: "billing-search::a",
            component: "media",
            basis: "billing",
            month: "2026-01-01",
            amountCents: 10000,
            source: "computed",
          },
        ],
        approvedSlice: { totalCents: 10000, lines: [] },
        feeSnapshot: null,
      })
    ) as Record<string, unknown>
    assert.deepEqual(Object.keys(parsed).sort(), [
      "approved_slice",
      "fee_snapshot",
      "schedule_months",
    ])
    assert.equal("datesUnsaved" in parsed, false)
    assert.equal("date_start" in parsed, false)
    assert.equal("liveCampaignDates" in parsed, false)
    assert.equal(
      computeSnapshotChecksum({
        scheduleMonths: [
          {
            lineItemId: "billing-search::a",
            component: "media",
            basis: "billing",
            month: "2026-01-01",
            amountCents: 10000,
            source: "computed",
          },
        ],
        approvedSlice: { totalCents: 10000, lines: [] },
        feeSnapshot: null,
      }).length,
      64
    )
  })
})

describe("buildMbaFromPersisted live dates wiring", () => {
  it("accepts liveCampaignDates separately from liveSelection", () => {
    assert.match(builderSrc, /liveCampaignDates\?:/)
    assert.match(builderSrc, /mbaCampaignDateFields\(/)
    assert.doesNotMatch(
      builderSrc,
      /resolveMbaRenderFilters\([\s\S]{0,200}liveCampaignDates/
    )
  })
})

describe("POST /api/mba/generate liveCampaignDates", () => {
  it("allowlists liveCampaignDates and passes it beside liveSelection", () => {
    assert.match(routeSrc, /parseMbaGenerateBody/)
    assert.match(routeSrc, /liveCampaignDates/)
    assert.match(
      routeSrc,
      /buildMbaFromPersisted\(\{[\s\S]*liveCampaignDates[\s\S]*\}\)/
    )
  })
})

describe("edit page sends live dates only on Generate, never on save-time upload", () => {
  it("generateMbaPdfBlob posts liveCampaignDates when liveScope and dates differ", () => {
    assert.match(editSrc, /liveCampaignDatesIfChanged/)
    assert.match(editSrc, /mp_campaigndates_start/)
    assert.match(editSrc, /mp_campaigndates_end/)
    assert.match(
      editSrc,
      /opts\?\.liveScope[\s\S]{0,400}liveCampaignDates/
    )
  })

  it("save-time upload calls generateMbaPdfBlob with planVersion only", () => {
    assert.match(
      editSrc,
      /generateMbaPdfBlob\(\{\s*planVersion:\s*planVersionForDocs\s*\}\)/
    )
    const saveCall = editSrc.match(
      /const mba = await generateMbaPdfBlob\(\{\s*planVersion:\s*planVersionForDocs\s*\}\)/
    )
    assert.ok(saveCall, "save-time MBA upload must stay planVersion-only")
  })

  it("create save-time upload never posts liveCampaignDates", () => {
    assert.equal(createSrc.includes("liveCampaignDates"), false)
    assert.match(
      createSrc,
      /generateMbaPdfBlob\(\{\s*planVersion:\s*planVersionForDocs\s*\}\)/
    )
  })
})

describe("generateMBA draws the watermark under Campaign Dates", () => {
  it("checks datesUnsaved immediately after the Campaign Dates line", () => {
    assert.match(
      generateMbaSrc,
      /Campaign Dates: From \$\{mbaData\.campaign\.date_start\}[\s\S]{0,250}datesUnsaved/
    )
    assert.match(
      generateMbaSrc,
      /Dates as edited in the plan/
    )
  })
})
