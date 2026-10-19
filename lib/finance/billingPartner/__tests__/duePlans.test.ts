/**
 * Pure due-AA classification. The loader applies the same rules to Postgres.
 * November cycle is Sydney 18 Oct 00:00 through 18 Nov 00:00, exclusive of the end.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  selectDueAaPlans,
  type PackMembership,
  type PublishedAaCandidate,
  type ScheduleMonthCell,
} from "@/lib/finance/billingPartner/duePlans"

const BILLING_MONTH = "2026-11-01"
/** 19 Oct 2026 13:00 Sydney (AEDT). Inside the November cycle. */
const IN_WINDOW = "2026-10-19T02:00:00.000Z"
/** 17 Oct 2026 23:00 Sydney. Before the 18th, so the October cycle. */
const BEFORE_WINDOW = "2026-10-17T12:00:00.000Z"

function candidate(
  overrides: Partial<PublishedAaCandidate> & Pick<PublishedAaCandidate, "versionId">,
): PublishedAaCandidate {
  const publishedAt = overrides.publishedAt ?? IN_WINDOW
  return {
    mbaNumber: "MBA1",
    clientName: "Client",
    campaignName: "Campaign",
    versionNumber: 1,
    masterId: 10,
    publishedAt,
    publishedBy: "planner@assembledmedia.com.au",
    firstPublishedAt: publishedAt,
    isAaPlan: true,
    ...overrides,
  }
}

function cell(
  overrides: Partial<ScheduleMonthCell> &
    Pick<ScheduleMonthCell, "versionId" | "month" | "amountCents">,
): ScheduleMonthCell {
  return {
    lineItemId: "LINE1",
    component: "media",
    basis: "billing",
    aaBillingMedia: true,
    ...overrides,
  }
}

test("a first publish is new and a later publish is amended", () => {
  const due = selectDueAaPlans({
    billingMonth: BILLING_MONTH,
    versions: [
      candidate({ versionId: 1, versionNumber: 1, firstPublishedAt: IN_WINDOW }),
      candidate({
        versionId: 2,
        versionNumber: 2,
        mbaNumber: "MBA2",
        masterId: 11,
        publishedAt: "2026-10-20T02:00:00.000Z",
        firstPublishedAt: "2026-09-01T02:00:00.000Z",
      }),
    ],
    packs: [],
    scheduleMonths: [],
  })

  const byId = new Map(due.map((row) => [row.versionId, row.changeKind]))
  assert.equal(byId.get(1), "new")
  assert.equal(byId.get(2), "amended")
})

test("a version already in a sent pack is not due", () => {
  const sent: PackMembership = {
    versionId: 1,
    mbaNumber: "MBA1",
    status: "sent",
    billingMonth: "2026-10-01",
    sentAt: "2026-10-17T01:00:00.000Z",
  }
  const due = selectDueAaPlans({
    billingMonth: BILLING_MONTH,
    versions: [candidate({ versionId: 1 })],
    packs: [sent],
    scheduleMonths: [],
  })
  assert.deepEqual(due, [])
})

test("a version only in a draft pack is still due", () => {
  const due = selectDueAaPlans({
    billingMonth: BILLING_MONTH,
    versions: [candidate({ versionId: 1 })],
    packs: [
      {
        versionId: 1,
        mbaNumber: "MBA1",
        status: "draft",
        billingMonth: BILLING_MONTH,
        sentAt: null,
      },
    ],
    scheduleMonths: [cell({ versionId: 1, month: "2026-11-01", amountCents: 5000 })],
  })
  assert.equal(due.length, 1)
  assert.equal(due[0]?.versionId, 1)
  assert.equal(due[0]?.changeKind, "new")
  assert.equal(due[0]?.monthsChanged, null)
  assert.equal(due[0]?.backDated, false)
  assert.deepEqual(due[0]?.aaMonthTotals, { "2026-11": 50 })
})

test("months changed are the schedule months that differ from the last sent version", () => {
  const due = selectDueAaPlans({
    billingMonth: BILLING_MONTH,
    versions: [
      candidate({
        versionId: 20,
        versionNumber: 4,
        publishedAt: "2026-10-21T02:00:00.000Z",
        firstPublishedAt: "2026-08-01T02:00:00.000Z",
      }),
    ],
    packs: [
      {
        versionId: 10,
        mbaNumber: "MBA1",
        status: "sent",
        billingMonth: "2026-09-01",
        sentAt: "2026-09-17T01:00:00.000Z",
      },
      {
        versionId: 11,
        mbaNumber: "MBA1",
        status: "sent",
        billingMonth: "2026-10-01",
        sentAt: "2026-10-17T01:00:00.000Z",
      },
    ],
    scheduleMonths: [
      cell({ versionId: 11, month: "2026-10-01", amountCents: 10000 }),
      cell({ versionId: 11, month: "2026-11-01", amountCents: 20000 }),
      cell({ versionId: 10, month: "2026-10-01", amountCents: 1 }),
      cell({ versionId: 20, month: "2026-10-01", amountCents: 15000 }),
      cell({ versionId: 20, month: "2026-11-01", amountCents: 20000 }),
      cell({
        versionId: 20,
        month: "2026-11-01",
        amountCents: 999,
        component: "fee",
        aaBillingMedia: false,
      }),
      cell({
        versionId: 11,
        month: "2026-11-01",
        amountCents: 100,
        component: "fee",
        aaBillingMedia: false,
      }),
    ],
  })

  assert.equal(due.length, 1)
  assert.equal(due[0]?.changeKind, "amended")
  assert.deepEqual(due[0]?.monthsChanged, ["2026-10", "2026-11"])
  assert.equal(due[0]?.backDated, true)
  assert.deepEqual(due[0]?.aaMonthTotals, { "2026-10": 150, "2026-11": 200 })
})

test("a change only in the billing month is not back-dated", () => {
  const due = selectDueAaPlans({
    billingMonth: "2026-11",
    versions: [
      candidate({
        versionId: 20,
        versionNumber: 2,
        firstPublishedAt: "2026-08-01T02:00:00.000Z",
      }),
    ],
    packs: [
      {
        versionId: 11,
        mbaNumber: "MBA1",
        status: "sent",
        billingMonth: "2026-10-01",
        sentAt: "2026-10-17T01:00:00.000Z",
      },
    ],
    scheduleMonths: [
      cell({ versionId: 11, month: "2026-11-01", amountCents: 10000 }),
      cell({ versionId: 20, month: "2026-11-01", amountCents: 12000 }),
    ],
  })
  assert.deepEqual(due[0]?.monthsChanged, ["2026-11"])
  assert.equal(due[0]?.backDated, false)
})

test("monthsChanged is null when either version has no schedule_months rows", () => {
  const base = {
    billingMonth: BILLING_MONTH,
    versions: [
      candidate({
        versionId: 20,
        versionNumber: 2,
        firstPublishedAt: "2026-08-01T02:00:00.000Z",
      }),
    ],
    packs: [
      {
        versionId: 11,
        mbaNumber: "MBA1",
        status: "sent",
        billingMonth: "2026-10-01",
        sentAt: "2026-10-17T01:00:00.000Z",
      },
    ] satisfies PackMembership[],
  }

  const missingPrevious = selectDueAaPlans({
    ...base,
    scheduleMonths: [cell({ versionId: 20, month: "2026-11-01", amountCents: 5000 })],
  })
  assert.equal(missingPrevious[0]?.monthsChanged, null)
  assert.equal(missingPrevious[0]?.backDated, false)
  assert.deepEqual(missingPrevious[0]?.aaMonthTotals, { "2026-11": 50 })

  const missingCurrent = selectDueAaPlans({
    ...base,
    scheduleMonths: [cell({ versionId: 11, month: "2026-10-01", amountCents: 5000 })],
  })
  assert.equal(missingCurrent[0]?.monthsChanged, null)
  assert.equal(missingCurrent[0]?.backDated, false)
  assert.deepEqual(missingCurrent[0]?.aaMonthTotals, {})
})

test("a publish before the 18th is not due for that billing month", () => {
  const due = selectDueAaPlans({
    billingMonth: BILLING_MONTH,
    versions: [candidate({ versionId: 1, publishedAt: BEFORE_WINDOW, firstPublishedAt: BEFORE_WINDOW })],
    packs: [],
    scheduleMonths: [],
  })
  assert.deepEqual(due, [])
})

test("a plan that does not store an AA workbook is not due", () => {
  const due = selectDueAaPlans({
    billingMonth: BILLING_MONTH,
    versions: [candidate({ versionId: 1, isAaPlan: false })],
    packs: [],
    scheduleMonths: [],
  })
  assert.deepEqual(due, [])
})
