import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import type { FeeLoading, LineItemInput } from "@/lib/finance/campaignFinancials.types"
import {
  buildFeeRatesChangedNotice,
  createMemoryFeeSnapshotTransport,
  FEE_SNAPSHOT_META_MEDIA_TYPE,
  normalizeFeeSnapshotClient,
  PLANC_FEESNAP_FALLBACK_PREFIX,
  readFeeSnapshot,
  readFeeSnapshotBundle,
  resolveFeeLoadingForVersion,
  setFeeSnapshotTransportForTests,
  writeFeeSnapshot,
  writeFeeSnapshotOnce,
} from "@/lib/finance/feeSnapshots"

const LIVE_FEES: FeeLoading = {
  feesearch: 20,
  feesocial: 15,
  feetelevision: 10,
  feedigidisplay: 12,
}

function searchLine(): LineItemInput {
  return {
    lineItemId: "S1",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 10_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    approval: "approved",
  }
}

afterEach(() => {
  setFeeSnapshotTransportForTests(null)
})

test("writeFeeSnapshotOnce: write-once semantics (draft overwrite reuse)", async () => {
  const mem = createMemoryFeeSnapshotTransport()
  setFeeSnapshotTransportForTests(mem)

  const first = await writeFeeSnapshotOnce(101, {
    feeLoading: LIVE_FEES,
    adservvideo: 2,
    adservimp: 1.5,
  })
  assert.equal(first.wrote, true)
  assert.equal(first.bundle?.feeLoading.feesearch, 20)

  const feeRowsBefore = mem.rows.filter(
    (r) => r.media_type !== FEE_SNAPSHOT_META_MEDIA_TYPE && String(r.media_plan_version) === "101"
  ).length
  assert.ok(feeRowsBefore >= 4)

  const second = await writeFeeSnapshotOnce(101, {
    feeLoading: { ...LIVE_FEES, feesearch: 99 },
    adservvideo: 9,
  })
  assert.equal(second.wrote, false)
  assert.equal(second.bundle?.feeLoading.feesearch, 20, "must keep first snapshot rates")

  const feeRowsAfter = mem.rows.filter(
    (r) => r.media_type !== FEE_SNAPSHOT_META_MEDIA_TYPE && String(r.media_plan_version) === "101"
  ).length
  assert.equal(feeRowsAfter, feeRowsBefore)

  const readBack = await readFeeSnapshot(101)
  assert.deepEqual(readBack?.feesearch, 20)
  assert.deepEqual(readBack?.feesocial, 15)
})

test("resolveFeeLoadingForVersion: falls back to live + logs once when snapshot missing", async () => {
  const mem = createMemoryFeeSnapshotTransport()
  setFeeSnapshotTransportForTests(mem)

  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args)
  }
  try {
    const resolved = await resolveFeeLoadingForVersion({
      versionId: 777,
      liveFeeLoading: LIVE_FEES,
      meta: { mba_number: "MBA-1", version: 3 },
    })
    assert.equal(resolved.fromSnapshot, false)
    assert.equal(resolved.feeLoading.feesearch, 20)

    const fallbackLogs = warnings.filter(
      (args) => args[0] === PLANC_FEESNAP_FALLBACK_PREFIX
    )
    assert.equal(fallbackLogs.length, 1)
    assert.deepEqual(fallbackLogs[0]?.[1], {
      mba_number: "MBA-1",
      version: 3,
      versionId: 777,
    })
  } finally {
    console.warn = originalWarn
  }

  // After a snapshot exists, no fallback log and rates come from snapshot.
  await writeFeeSnapshot(777, { feeLoading: { feesearch: 33 } })
  const warnings2: unknown[][] = []
  console.warn = (...args: unknown[]) => {
    warnings2.push(args)
  }
  try {
    const resolved = await resolveFeeLoadingForVersion({
      versionId: 777,
      liveFeeLoading: LIVE_FEES,
      meta: { mba_number: "MBA-1", version: 3 },
    })
    assert.equal(resolved.fromSnapshot, true)
    assert.equal(resolved.feeLoading.feesearch, 33)
    assert.equal(
      warnings2.filter((a) => a[0] === PLANC_FEESNAP_FALLBACK_PREFIX).length,
      0
    )
  } finally {
    console.warn = originalWarn
  }
})

test("buildFeeRatesChangedNotice: detects fee + adserv changes; null when identical", () => {
  const previous = normalizeFeeSnapshotClient({
    feeLoading: LIVE_FEES,
    adservvideo: 2,
    adservimp: 1,
  })
  const identical = normalizeFeeSnapshotClient({
    feeLoading: { ...LIVE_FEES },
    adservvideo: 2,
    adservimp: 1,
  })
  assert.equal(
    buildFeeRatesChangedNotice({
      previousVersionId: 10,
      previousVersionNumber: 13,
      previous,
      next: identical,
    }),
    null
  )

  const changed = normalizeFeeSnapshotClient({
    feeLoading: { ...LIVE_FEES, feesearch: 25 },
    adservvideo: 3,
    adservimp: 1,
  })
  const notice = buildFeeRatesChangedNotice({
    previousVersionId: 10,
    previousVersionNumber: 13,
    previous,
    next: changed,
  })
  assert.ok(notice)
  assert.equal(notice!.previousVersionId, 10)
  assert.equal(notice!.previousVersionNumber, 13)
  assert.deepEqual(notice!.changedFeeFields, ["feesearch"])
  assert.equal(notice!.adservChanged, true)
  assert.equal(notice!.budgetIncludesFeesChanged, false)
})

test("engine parity: identical snapshot rates produce same financials as live rates", async () => {
  const mem = createMemoryFeeSnapshotTransport()
  setFeeSnapshotTransportForTests(mem)

  await writeFeeSnapshot(55, {
    feeLoading: LIVE_FEES,
    adservvideo: 2,
  })
  const snap = await readFeeSnapshot(55)
  assert.ok(snap)

  const live = computeCampaignFinancials([searchLine()], { feeLoading: LIVE_FEES }, {
    campaignStart: new Date("2026-06-01"),
    campaignEnd: new Date("2026-06-30"),
  })
  const fromSnap = computeCampaignFinancials([searchLine()], { feeLoading: snap! }, {
    campaignStart: new Date("2026-06-01"),
    campaignEnd: new Date("2026-06-30"),
  })

  assert.equal(fromSnap.mbaScopeTotals.nettExGst, live.mbaScopeTotals.nettExGst)
  assert.equal(fromSnap.perLine[0]?.fee, live.perLine[0]?.fee)
  assert.equal(fromSnap.perLine[0]?.media, live.perLine[0]?.media)
  assert.deepEqual(
    fromSnap.billingSchedule.map((m) => ({
      month: m.monthYear,
      media: m.mediaTotal,
      fee: m.feeTotal,
    })),
    live.billingSchedule.map((m) => ({
      month: m.monthYear,
      media: m.mediaTotal,
      fee: m.feeTotal,
    }))
  )
})

test("readFeeSnapshotBundle: meta row carries adserv + bif JSON", async () => {
  const mem = createMemoryFeeSnapshotTransport()
  setFeeSnapshotTransportForTests(mem)

  await writeFeeSnapshot(9, {
    feesearch: 18,
    adservdisplay: 0.5,
    budgetIncludesFeesMeta: { defaultIncludesFees: true },
  })

  const bundle = await readFeeSnapshotBundle(9)
  assert.ok(bundle)
  assert.equal(bundle!.feeLoading.feesearch, 18)
  assert.equal(bundle!.adservRates.adservdisplay, 0.5)
  assert.equal(bundle!.budgetIncludesFeesMeta.defaultIncludesFees, true)
})
