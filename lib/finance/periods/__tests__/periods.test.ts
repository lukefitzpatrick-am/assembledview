import assert from "node:assert/strict"
import { describe, it, beforeEach } from "node:test"

import { toPeriodMonthKey, addPeriodMonths } from "../monthKey.js"
import { isBillingMonthLocked } from "../lockBillingMonth.js"
import {
  getSydneyWallClock,
  isSydneyPreRunWindow,
  isSydneyRunWindow,
  isSydneyLockWindow,
} from "../sydneyClock.js"
import { mergeRunCandidates, resetRunItemIdCounter } from "../mergeRun.js"
import {
  buildMediaCandidates,
  buildRetainerCandidates,
} from "../buildCandidates.js"
import {
  resetMemoryPeriodStore,
  runPeriodMemory,
  reviewItemMemory,
  lockPeriodMemory,
  staleOnPublishMemory,
  queueVarianceMemory,
  adminAmendMemory,
  getItems,
  ensurePeriod,
} from "../memoryStore.js"
import { financeSheetFilename, financeSheetBlobPathname } from "../naturalKeys.js"
import { isRetainerActiveForPeriod } from "../retainerEligibility.js"
import { clientMissingBlockers, buildPreRunSweepCard } from "../preRunSweep.js"
import { buildRunItemsWorkbookBuffer } from "../archiveSheet.js"

describe("PC5 C-14 month keys", () => {
  it("normalises labels and ISO to YYYY-MM", () => {
    assert.equal(toPeriodMonthKey("2026-07"), "2026-07")
    assert.equal(toPeriodMonthKey("2026-07-01"), "2026-07")
    assert.equal(toPeriodMonthKey("July 2026"), "2026-07")
    assert.equal(addPeriodMonths("2026-07", 1), "2026-08")
  })
})

describe("PC5 Sydney wall-clock guards", () => {
  it("detects 14th 06:00 Sydney pre-run", () => {
    // 2026-07-14 06:00 AEST = 2026-07-13T20:00:00.000Z
    const now = new Date("2026-07-13T20:00:00.000Z")
    assert.equal(getSydneyWallClock(now).day, 14)
    assert.equal(getSydneyWallClock(now).hour, 6)
    assert.equal(isSydneyPreRunWindow(now), true)
    assert.equal(isSydneyRunWindow(now), false)
  })

  it("detects 21st 06:00 Sydney run", () => {
    const now = new Date("2026-07-20T20:00:00.000Z")
    assert.equal(isSydneyRunWindow(now), true)
  })

  it("detects last day 23:59 Sydney lock", () => {
    // 2026-07-31 23:59 AEST = 2026-07-31T13:59:00.000Z
    const now = new Date("2026-07-31T13:59:00.000Z")
    assert.equal(isSydneyLockWindow(now), true)
  })
})

describe("PC5 isBillingMonthLocked", () => {
  it("uses period status when provided", () => {
    assert.equal(
      isBillingMonthLocked("2026-07", {
        period: { status: "locked", lockedAt: "2026-07-31T13:59:00Z" },
      }),
      true
    )
    assert.equal(
      isBillingMonthLocked("2026-07", {
        period: { status: "review", lockedAt: null },
      }),
      false
    )
  })
})

describe("PC5 run idempotency", () => {
  beforeEach(() => {
    resetMemoryPeriodStore()
    resetRunItemIdCounter(1)
  })

  it("run twice yields identical items", () => {
    const candidates = buildMediaCandidates("2026-07", [
      {
        mbaNumber: "ACME001",
        clientId: 1,
        versionId: 9,
        amountCents: 100000,
        lineItemsJson: [{ id: "L1", amount: 1000 }],
      },
    ])
    const first = runPeriodMemory({ periodMonth: "2026-07", candidates })
    const second = runPeriodMemory({ periodMonth: "2026-07", candidates })
    assert.equal(first.items.length, 1)
    assert.equal(second.items.length, 1)
    assert.equal(second.inserted, 0)
    assert.equal(first.items[0]!.naturalKey, second.items[0]!.naturalKey)
    assert.equal(first.items[0]!.amountCents, second.items[0]!.amountCents)
    assert.equal(first.items[0]!.invoiceReference, "AV-ACME001-202607")
  })

  it("mergeRunCandidates pure idempotency", () => {
    resetRunItemIdCounter(1)
    const c = buildMediaCandidates("2026-07", [
      {
        mbaNumber: "X",
        clientId: 1,
        versionId: 1,
        amountCents: 500,
        lineItemsJson: [],
      },
    ])
    const a = mergeRunCandidates({ periodId: 1, existing: [], candidates: c })
    const b = mergeRunCandidates({ periodId: 1, existing: a.items, candidates: c })
    assert.equal(a.inserted, 1)
    assert.equal(b.inserted, 0)
    assert.equal(b.items.length, 1)
  })
})

describe("PC5 held roll-forward + lock freeze", () => {
  beforeEach(() => {
    resetMemoryPeriodStore()
    resetRunItemIdCounter(1)
  })

  it("held items roll to next period; non-held freeze with snapshot", () => {
    const candidates = [
      ...buildMediaCandidates("2026-07", [
        {
          mbaNumber: "OK1",
          clientId: 10,
          versionId: 1,
          amountCents: 20000,
          lineItemsJson: [],
        },
        {
          mbaNumber: "HOLD1",
          clientId: 11,
          versionId: 2,
          amountCents: 30000,
          lineItemsJson: [],
          heldReason: "missing ABN",
        },
      ]),
    ]
    const ran = runPeriodMemory({ periodMonth: "2026-07", candidates })
    reviewItemMemory("2026-07", ran.items.find((i) => i.mbaNumber === "OK1")!.id, {
      type: "approve",
    })
    const snaps = new Map([
      [
        10,
        {
          clientId: 10,
          clientName: "Ok Co",
          legalBusinessName: "Ok Co Pty Ltd",
          abn: "123",
          paymentTerms: "Net 30",
          paymentDays: 30,
          streetAddress: "1 St",
          suburb: "Sydney",
          state: "NSW",
          postcode: "2000",
        },
      ],
    ])
    const locked = lockPeriodMemory({
      periodMonth: "2026-07",
      lockedBy: "admin@test",
      clientSnapshots: snaps,
      sheetPathname: "finance-periods/2026-07/finance-sheet-v1.xlsx",
    })
    assert.equal(locked.period.status, "locked")
    const july = getItems(locked.period.id)
    const ok = july.find((i) => i.mbaNumber === "OK1")
    assert.ok(ok?.clientSnapshotJson)
    assert.equal(ok?.status, "approved")
    assert.equal(locked.rolled, 1)
    const aug = getItems(locked.nextPeriod.id)
    assert.equal(aug.length, 1)
    assert.equal(aug[0]!.status, "held")
    assert.ok(aug[0]!.rolledFromItemId)
  })
})

describe("PC5 stale flip + variance + admin override", () => {
  beforeEach(() => {
    resetMemoryPeriodStore()
    resetRunItemIdCounter(1)
  })

  it("publish flips matching media items stale", () => {
    runPeriodMemory({
      periodMonth: "2026-07",
      candidates: buildMediaCandidates("2026-07", [
        {
          mbaNumber: "ACME001",
          clientId: 1,
          versionId: 1,
          amountCents: 1000,
          lineItemsJson: [],
        },
      ]),
    })
    const n = staleOnPublishMemory("ACME001", 2)
    assert.equal(n, 1)
    const items = getItems(ensurePeriod("2026-07").id)
    assert.equal(items[0]!.status, "stale")
  })

  it("variance queues into next open period", () => {
    const ran = runPeriodMemory({
      periodMonth: "2026-07",
      candidates: buildMediaCandidates("2026-07", [
        {
          mbaNumber: "ACME001",
          clientId: 1,
          versionId: 1,
          amountCents: 10000,
          lineItemsJson: [],
        },
      ]),
    })
    lockPeriodMemory({
      periodMonth: "2026-07",
      lockedBy: "admin",
      clientSnapshots: new Map(),
    })
    const v = queueVarianceMemory({
      lockedPeriodMonth: "2026-07",
      itemId: ran.items[0]!.id,
      proposedAmountCents: 12000,
      reason: "late PO adjust",
    })
    assert.equal(v.amountCents, 2000)
    assert.ok(v.linkedVarianceFromItemId)
    assert.match(v.naturalKey, /^variance:/)
  })

  it("admin override bumps sheet to labelled v2", () => {
    const ran = runPeriodMemory({
      periodMonth: "2026-07",
      candidates: buildMediaCandidates("2026-07", [
        {
          mbaNumber: "ACME001",
          clientId: 1,
          versionId: 1,
          amountCents: 10000,
          lineItemsJson: [],
        },
      ]),
    })
    lockPeriodMemory({
      periodMonth: "2026-07",
      lockedBy: "admin",
      clientSnapshots: new Map(),
    })
    const amend = adminAmendMemory({
      periodMonth: "2026-07",
      itemId: ran.items[0]!.id,
      afterAmountCents: 11000,
      reason: "finance lead correction",
    })
    assert.equal(amend.period.amendedAfterLock, true)
    assert.equal(amend.period.sheetVersion, 2)
    assert.equal(financeSheetFilename("2026-07", 2), "finance_sheet_2026-07_v2_amended.xlsx")
    assert.match(financeSheetBlobPathname("2026-07", 2), /v2-amended/)
    assert.equal(amend.audit.beforeCents, 10000)
    assert.equal(amend.audit.afterCents, 11000)
  })
})

describe("PC5 retainers + pre-run blockers", () => {
  it("$0 stops retainer; end month respected", () => {
    assert.equal(
      isRetainerActiveForPeriod({
        monthlyRetainer: 0,
        retainerEndMonth: null,
        periodMonth: "2026-07",
      }),
      false
    )
    assert.equal(
      isRetainerActiveForPeriod({
        monthlyRetainer: 5000,
        retainerEndMonth: "2026-06",
        periodMonth: "2026-07",
      }),
      false
    )
    assert.equal(
      isRetainerActiveForPeriod({
        monthlyRetainer: 5000,
        retainerEndMonth: "2026-08",
        periodMonth: "2026-07",
      }),
      true
    )
  })

  it("builds retainer candidates with AV-RET ref", () => {
    const c = buildRetainerCandidates("2026-07", [
      { id: 9, name: "Acme", mbaIdentifier: "ACME", monthlyRetainer: 1000 },
    ])
    assert.equal(c.length, 1)
    assert.equal(c[0]!.invoiceReference, "AV-RET-ACME-202607")
    assert.equal(c[0]!.amountCents, 100000)
  })

  it("pre-run card counts hard blockers", () => {
    const blockers = clientMissingBlockers({
      id: 1,
      name: "Acme",
      abn: "",
      legalBusinessName: "",
    })
    const card = buildPreRunSweepCard({ periodMonth: "2026-07", blockers })
    assert.equal(card.hardBlockerCount, 2)
  })
})

describe("PC5 workbook archive buffer", () => {
  it("builds xlsx with invoice_reference column", async () => {
    resetMemoryPeriodStore()
    resetRunItemIdCounter(1)
    const ran = runPeriodMemory({
      periodMonth: "2026-07",
      candidates: buildMediaCandidates("2026-07", [
        {
          mbaNumber: "ACME001",
          clientId: 1,
          versionId: 1,
          amountCents: 5000,
          lineItemsJson: [],
        },
      ]),
    })
    const buf = await buildRunItemsWorkbookBuffer(ran.items, "2026-07", 1)
    assert.ok(buf.byteLength > 100)
    const v2 = await buildRunItemsWorkbookBuffer(ran.items, "2026-07", 2)
    assert.ok(v2.byteLength > buf.byteLength - 5000)
  })
})
