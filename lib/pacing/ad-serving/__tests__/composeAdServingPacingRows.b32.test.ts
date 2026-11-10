/**
 * B32: the Ad Serving pacing composer reads a Channel Factory Digital Video
 * line's own partner-file rows and marks the row `deliverySource`. Every
 * other row is byte-identical to the composer at 37bec7e1 (`legacyCompose`
 * below is that loop, copied unchanged).
 */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import {
  adServingPartnerFileLineIds,
  adServingPartnerPublisher,
  composeAdServingPacingRows,
  isAdServingPartnerFileRow,
} from "@/lib/pacing/ad-serving/composeAdServingPacingRows"
import type { AdServingPacingCampaignRow } from "@/lib/pacing/ad-serving/types"
import type { PacingFactRow } from "@/lib/snowflake/pacing-fact"

const BURST = {
  index: 0,
  startDate: "2026-10-20",
  endDate: "2026-12-24",
  budget: 30000,
  buyAmount: 0.07,
  calculatedValue: 428571,
}

function planRow(
  lineItemId: string,
  extra: Partial<AdServingPacingCampaignRow> = {},
): AdServingPacingCampaignRow {
  return {
    mbaNumber: "B32TEST001",
    mediaPlanVersionId: 16999,
    mediaPlanVersionNumber: 3,
    lineItemId,
    lineItemNumber: 1,
    xanoRowId: 1,
    clientName: "Acme",
    campaignName: "Holiday",
    campaignStatus: "approved",
    campaignStartDate: "2026-10-01",
    campaignEndDate: "2027-01-04",
    campaignEnded: false,
    brand: null,
    platform: "",
    bidStrategy: "",
    buyType: "cpv",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    channelFamily: "digitalVideo",
    lineItemStartDate: "2026-10-20",
    lineItemEndDate: "2026-12-24",
    totalBursts: 1,
    bursts: [BURST],
    currentBurstIndex: 0,
    currentBurst: BURST,
    lineItemStatus: "no-data",
    plannedImpressions: 428571,
    plannedClicks: 0,
    impressions: 0,
    clicks: 0,
    ctr: null,
    videoCompletes: 0,
    results: 0,
    daysActive: 0,
    deliverableProgress: null,
    deliverableActual: 0,
    deliverableTarget: 428571,
    deliverableKind: "impressions",
    budgetIncludesFees: false,
    ...extra,
  }
}

function fact(
  channel: string,
  lineItemId: string,
  day: string,
  impressions: number,
  clicks: number,
  views: number,
  results = 0,
): PacingFactRow {
  return {
    CHANNEL: channel,
    DATE_DAY: day,
    LINE_ITEM_ID: lineItemId,
    ENTITY_NAME: null,
    ENTITY_ID: null,
    CAMPAIGN_NAME: null,
    AMOUNT_SPENT: 0,
    IMPRESSIONS: impressions,
    CLICKS: clicks,
    RESULTS: results,
    VIDEO_3S_VIEWS: views,
    MAX_FIVETRAN_SYNCED_AT: null,
    UPDATED_AT: null,
  }
}

/** The 37bec7e1 loop in `fetchAdServingPacingCampaignRows`, unchanged. */
function legacyCompose(
  planRows: AdServingPacingCampaignRow[],
  facts: PacingFactRow[],
  lineTotalStart: string,
  countTo: string,
): AdServingPacingCampaignRow[] {
  const num = (value: number | null | undefined) => value ?? 0
  const safeCtr = (clicks: number, impressions: number) => {
    if (!Number.isFinite(impressions) || impressions <= 0) return null
    if (!Number.isFinite(clicks)) return null
    return clicks / impressions
  }
  const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)
  const byLineItem = new Map<string, PacingFactRow[]>()
  for (const f of facts) {
    const k = String(f.LINE_ITEM_ID ?? "").trim().toLowerCase()
    if (!k) continue
    let bucket = byLineItem.get(k)
    if (!bucket) {
      bucket = []
      byLineItem.set(k, bucket)
    }
    bucket.push(f)
  }
  const out: AdServingPacingCampaignRow[] = []
  for (const row of planRows) {
    const matched = byLineItem.get(row.lineItemId.toLowerCase()) ?? []
    if (matched.length === 0) continue
    const windowStart = row.lineItemStartDate ?? lineTotalStart
    const windowEnd = countTo
    let impressions = 0
    let clicks = 0
    let results = 0
    let videoCompletes = 0
    const activeDays = new Set<string>()
    for (const f of matched) {
      const d = f.DATE_DAY
      if (d < windowStart || d > windowEnd) continue
      impressions += num(f.IMPRESSIONS)
      clicks += num(f.CLICKS)
      results += num(f.RESULTS)
      videoCompletes += num(f.VIDEO_3S_VIEWS)
      if (num(f.IMPRESSIONS) > 0 || num(f.CLICKS) > 0 || num(f.RESULTS) > 0 || num(f.VIDEO_3S_VIEWS) > 0) {
        activeDays.add(d)
      }
    }
    row.impressions = impressions
    row.clicks = clicks
    row.results = results
    row.videoCompletes = videoCompletes
    row.ctr = safeCtr(clicks, impressions)
    row.daysActive = activeDays.size
    row.lineItemStatus = "serving"
    if (row.deliverableKind === "impressions" && row.deliverableTarget > 0) {
      row.deliverableActual = impressions
      row.deliverableProgress = clamp01(impressions / row.deliverableTarget)
    } else if (row.deliverableKind === "clicks" && row.deliverableTarget > 0) {
      row.deliverableActual = clicks
      row.deliverableProgress = clamp01(clicks / row.deliverableTarget)
    } else {
      row.deliverableActual = 0
      row.deliverableProgress = null
    }
    out.push(row)
  }
  return out
}

/** A Channel Factory DV line as the resolver builds it (publisher set). */
function cfRow(lineItemId: string, extra: Partial<AdServingPacingCampaignRow> = {}) {
  const publisher = adServingPartnerPublisher("digitalVideo", "Channel Factory", "")
  assert.equal(publisher, "Channel Factory")
  return planRow(lineItemId, { publisher, ...extra })
}

const CM = "ad-serving"
const PF = "programmatic-video"

test("B32: adServingPartnerPublisher is Channel Factory Digital Video only", () => {
  assert.equal(adServingPartnerPublisher("digitalVideo", " Channel Factory ", ""), "Channel Factory")
  assert.equal(adServingPartnerPublisher("digitalVideo", "", "Channel Factory"), "")
  assert.equal(adServingPartnerPublisher("digitalVideo", "UMG Popsta", "Channel Factory"), undefined)
  assert.equal(adServingPartnerPublisher("digitalVideo", "Vistar", ""), undefined)
  assert.equal(adServingPartnerPublisher("digitalVideo", null, null), undefined)
  for (const family of ["digitalDisplay", "digitalAudio", "bvod"] as const) {
    assert.equal(adServingPartnerPublisher(family, "Channel Factory", ""), undefined, family)
  }
  // A blank publisher with a Channel Factory platform still reads partner rows.
  const blank = planRow("x1dv1", { publisher: "", platform: "Channel Factory" })
  assert.equal(isAdServingPartnerFileRow(blank), true)
  // Without the resolver's publisher stamp a row never reads partner rows.
  assert.equal(isAdServingPartnerFileRow(planRow("x1dv2", { platform: "Channel Factory" })), false)
  // A stamped row on another family is not a partner row.
  assert.equal(isAdServingPartnerFileRow(planRow("x1dd1", { publisher: "Channel Factory", channelFamily: "digitalDisplay" })), false)
})

test("B32: partner ids are the stamped Channel Factory DV lines, lowercased, once", () => {
  const rows = [
    cfRow("PENFOLD020DV2"),
    cfRow("penfold020dv2"),
    planRow("penfold020dv1", {}),
    planRow("x1dd1", { channelFamily: "digitalDisplay" }),
  ]
  assert.deepEqual(adServingPartnerFileLineIds(rows), ["penfold020dv2"])
  assert.deepEqual(adServingPartnerFileLineIds([planRow("a"), planRow("b")]), [])
})

test("B32: a Channel Factory line with partner rows only is partner_file, counts are the partner rows", () => {
  const [row] = composeAdServingPacingRows({
    planRows: [cfRow("penfold020dv2")],
    facts: [],
    partnerFacts: [
      fact(PF, "PENFOLD020DV2", "2026-10-20", 1000, 3, 700),
      fact(PF, "penfold020dv2", "2026-10-21", 2000, 1, 1500),
      fact(PF, "penfold020dv2", "2026-11-11", 9999, 9, 9999), // after count-to
    ],
    lineTotalStart: "2026-10-20",
    countTo: "2026-11-09",
  })
  assert.ok(row)
  assert.equal(row.deliverySource, "partner_file")
  assert.equal(row.publisher, "Channel Factory")
  assert.equal(row.lineItemStatus, "serving")
  assert.equal(row.impressions, 3000)
  assert.equal(row.clicks, 4)
  assert.equal(row.videoCompletes, 2200)
  assert.equal(row.daysActive, 2)
  assert.equal(row.deliverableActual, 3000)
})

test("B32: CM360 plus partner rows on one line sum once each (dashboard rule, C-182)", () => {
  const cm = [fact(CM, "trwico001dv1", "2026-10-21", 500, 2, 0), fact(CM, "trwico001dv1", "2026-10-22", 0, 0, 0)]
  const pf = [fact(PF, "trwico001dv1", "2026-10-21", 1000, 1, 800), fact(PF, "trwico001dv1", "2026-10-22", 1000, 1, 800)]
  const [row] = composeAdServingPacingRows({
    planRows: [cfRow("trwico001dv1")],
    facts: cm,
    partnerFacts: pf,
    lineTotalStart: "2026-10-15",
    countTo: "2026-11-09",
  })
  assert.ok(row)
  assert.equal(row.deliverySource, "partner_file_and_cm360")
  assert.equal(row.impressions, 2500)
  assert.equal(row.clicks, 4)
  assert.equal(row.videoCompletes, 1600)
  assert.equal(row.daysActive, 2)
})

test("B32: partner rows with no delivery beside delivering CM360 rows stay CM360 (no deliverySource)", () => {
  const [row] = composeAdServingPacingRows({
    planRows: [cfRow("a1dv1")],
    facts: [fact(CM, "a1dv1", "2026-10-21", 500, 2, 0)],
    partnerFacts: [fact(PF, "a1dv1", "2026-10-21", 0, 0, 0)],
    lineTotalStart: "2026-10-15",
    countTo: "2026-11-09",
  })
  assert.ok(row)
  assert.equal(row.deliverySource, undefined)
  assert.equal(row.impressions, 500)
  // Partner zero rows alone still list the line, marked partner_file.
  const [zero] = composeAdServingPacingRows({
    planRows: [cfRow("a1dv2")],
    facts: [],
    partnerFacts: [fact(PF, "a1dv2", "2026-10-21", 0, 0, 0)],
    lineTotalStart: "2026-10-15",
    countTo: "2026-11-09",
  })
  assert.equal(zero?.deliverySource, "partner_file")
  assert.equal(zero?.impressions, 0)
  // Partner rows outside the line window are not delivery.
  const [late] = composeAdServingPacingRows({
    planRows: [cfRow("a1dv3")],
    facts: [fact(CM, "a1dv3", "2026-10-21", 10, 0, 0)],
    partnerFacts: [fact(PF, "a1dv3", "2026-10-01", 5000, 0, 0)],
    lineTotalStart: "2026-10-01",
    countTo: "2026-11-09",
  })
  assert.equal(late?.deliverySource, undefined)
  assert.equal(late?.impressions, 10)
})

test("B32: a Channel Factory line with no rows is omitted, as before", () => {
  const rows = composeAdServingPacingRows({
    planRows: [cfRow("a1dv1")],
    facts: [],
    partnerFacts: [fact(PF, "zz1dv1", "2026-10-21", 5, 0, 0)],
    lineTotalStart: "2026-10-15",
    countTo: "2026-11-09",
  })
  assert.deepEqual(rows, [])
})

test("B32: partner rows on a line that is not Channel Factory are ignored", () => {
  const rows = composeAdServingPacingRows({
    planRows: [
      planRow("penfold020dv1", {}),
      planRow("a1dv9", { platform: "Channel Factory" }),
      planRow("a1dd1", { channelFamily: "digitalDisplay", publisher: "Channel Factory" }),
    ],
    facts: [fact(CM, "a1dv9", "2026-10-21", 7, 0, 0)],
    partnerFacts: [
      fact(PF, "penfold020dv1", "2026-10-21", 1000, 0, 0),
      fact(PF, "a1dv9", "2026-10-21", 1000, 0, 0),
      fact(PF, "a1dd1", "2026-10-21", 1000, 0, 0),
    ],
    lineTotalStart: "2026-10-15",
    countTo: "2026-11-09",
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.lineItemId, "a1dv9")
  assert.equal(rows[0]!.impressions, 7)
  assert.equal(rows[0]!.deliverySource, undefined)
})

// ---------------------------------------------------------------------------
// Byte-identical proof for every row without a Channel Factory publisher.

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const FAMILIES = ["digitalDisplay", "digitalVideo", "digitalAudio", "bvod"] as const
const PUBLISHERS: Array<[unknown, unknown]> = [
  ["Seven", ""],
  ["UMG Popsta", "Channel Factory"],
  ["Vistar", ""],
  ["", ""],
  [null, "cm360"],
  ["Quantcast", ""],
  ["Channel Factory", ""],
  ["", "Channel Factory"],
]
const DAYS = ["2026-10-01", "2026-10-19", "2026-10-20", "2026-10-28", "2026-11-09", "2026-11-10"]

function randomBook(seed: number) {
  const r = rng(seed)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
  const planRows: AdServingPacingCampaignRow[] = []
  const facts: PacingFactRow[] = []
  const partnerFacts: PacingFactRow[] = []
  const n = 1 + Math.floor(r() * 6)
  for (let i = 0; i < n; i += 1) {
    const family = pick(FAMILIES)
    const [publisher, platform] = pick(PUBLISHERS)
    const id = `b32m${seed}${family.slice(0, 3)}${i}`
    const kind = pick(["impressions", "clicks", null] as const)
    const stamped = adServingPartnerPublisher(family, publisher, platform)
    planRows.push(
      planRow(r() < 0.1 ? id.toUpperCase() : id, {
        channelFamily: family,
        platform: String(platform ?? ""),
        lineItemStartDate: r() < 0.2 ? null : pick(DAYS),
        deliverableKind: kind,
        deliverableTarget: kind ? Math.floor(r() * 100000) : 0,
        ...(stamped !== undefined ? { publisher: stamped } : {}),
      }),
    )
    const rowsHere = Math.floor(r() * 4)
    for (let j = 0; j < rowsHere; j += 1) {
      const zero = r() < 0.3
      facts.push(
        fact(CM, r() < 0.2 ? id.toUpperCase() : id, pick(DAYS), zero ? 0 : Math.floor(r() * 5000), zero ? 0 : Math.floor(r() * 20), zero ? 0 : Math.floor(r() * 3000), Math.floor(r() * 3)),
      )
    }
    const partnerHere = Math.floor(r() * 3)
    for (let j = 0; j < partnerHere; j += 1) {
      partnerFacts.push(fact(PF, id, pick(DAYS), Math.floor(r() * 5000), Math.floor(r() * 9), Math.floor(r() * 4000)))
    }
  }
  return { planRows, facts, partnerFacts }
}

test("B32: every row without a Channel Factory publisher is byte-identical to 37bec7e1 (2,000 random books)", () => {
  let compared = 0
  let partner = 0
  for (let seed = 1; seed <= 2000; seed += 1) {
    const book = randomBook(seed)
    const clone = () => structuredClone(book.planRows)
    const before = legacyCompose(clone(), book.facts, "2026-10-01", "2026-11-09")
    const after = composeAdServingPacingRows({
      planRows: clone(),
      facts: book.facts,
      partnerFacts: book.partnerFacts,
      lineTotalStart: "2026-10-01",
      countTo: "2026-11-09",
    })
    const plain = (rows: AdServingPacingCampaignRow[]) =>
      rows.filter((row) => !isAdServingPartnerFileRow(row)).map((row) => JSON.stringify(row))
    assert.deepEqual(plain(after), plain(before), `seed ${seed}`)
    compared += plain(after).length
    partner += after.filter(isAdServingPartnerFileRow).length
    for (const row of after) {
      if (!isAdServingPartnerFileRow(row)) {
        assert.equal("publisher" in row, false)
        assert.equal("deliverySource" in row, false)
      }
    }
    // A book with no Channel Factory line: whole output identical, partner facts ignored.
    if (!book.planRows.some(isAdServingPartnerFileRow)) {
      assert.equal(JSON.stringify(after), JSON.stringify(before), `seed ${seed} whole`)
    }
  }
  assert.ok(compared > 2000, `compared ${compared}`)
  assert.ok(partner > 100, `partner rows ${partner}`)
})

test("B32: a fixed CM360 book pins to its 37bec7e1 output hash", () => {
  const book = randomBook(424242)
  const plainRows = book.planRows.filter((row) => !isAdServingPartnerFileRow(row))
  const out = composeAdServingPacingRows({
    planRows: structuredClone(plainRows),
    facts: book.facts,
    partnerFacts: book.partnerFacts,
    lineTotalStart: "2026-10-01",
    countTo: "2026-11-09",
  })
  const legacy = legacyCompose(structuredClone(plainRows), book.facts, "2026-10-01", "2026-11-09")
  const hash = (rows: unknown) => createHash("sha256").update(JSON.stringify(rows)).digest("hex")
  assert.equal(hash(out), hash(legacy))
  // The real 37bec7e1 fetchAdServingPacingCampaignRows (module mocks, same book) gives this hash.
  assert.equal(hash(out), "6c3694776e928e5b4d6dffcacda8351c7d90e34a56d64f96be35cc36f753ef13")
  assert.ok(out.length > 0)
})
