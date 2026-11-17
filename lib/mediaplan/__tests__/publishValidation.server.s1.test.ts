/**
 * S1 A (B54): every server publish path runs the one validation set, behind
 * `publish_validation`. Each path is driven through its public function with
 * a database that fails the test if it is reached before the refusal, so a
 * path that stops calling the check fails here.
 */
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import type { Db } from "@/db"
import { BillingRevisionWriteError, publishBillingRevision } from "@/lib/data/publishBillingRevision"
import { SavePlanError, savePlanVersion, type SavePlanVersionInput } from "@/lib/data/savePlan"
import type { FeatureRow } from "@/lib/features/registry"
import { setFeatureRowReaderForTests } from "@/lib/features/server"
import { PUBLISH_VALIDATION_REFUSED } from "@/lib/mediaplan/publishValidation"
import { publishRefusal, publishRefusalForVersion } from "@/lib/mediaplan/publishValidation.server"
import { publisherGuardForSave } from "@/lib/mediaplan/publisherGuard.server"

const row = (key: string, enabled: boolean): FeatureRow => ({
  key,
  enabled,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  note: null,
})

function setSwitch(on: boolean) {
  setFeatureRowReaderForTests(async () => new Map([["publish_validation", row("publish_validation", on)]]))
}

afterEach(() => setFeatureRowReaderForTests(null))

class Reached extends Error {}

/** Any use of this database means the path went past the check. */
const untouchedDb = new Proxy(
  {},
  {
    get() {
      throw new Reached("the database was reached")
    },
  },
) as unknown as Db

const overlapping = [
  { startDate: "2026-11-01", endDate: "2026-11-15", budget: 100, calculatedValue: 10 },
  { startDate: "2026-11-10", endDate: "2026-11-30", budget: 100, calculatedValue: 10 },
]

const saveInput = (mode: SavePlanVersionInput["mode"]): SavePlanVersionInput => ({
  masterId: 1,
  mbaNumber: "test001",
  versionNumber: 1,
  mode,
  campaignStartDate: "2026-11-01",
  campaignEndDate: "2026-11-30",
  feeLoading: {},
  lineItems: [
    {
      lineItemId: "test001SM1",
      channel: "social",
      platform: "Meta",
      buyType: "cpm",
      mediaType: "socialMedia",
      rate: 10,
      enteredAmount: 200,
      bursts: overlapping,
    },
  ],
})

test("publishRefusal: off is null; on lists the refused lines", async () => {
  const plan = { campaignStartDate: "2026-11-01", campaignEndDate: "2026-11-30", lineItems: saveInput("publish").lineItems }
  setSwitch(false)
  assert.equal(await publishRefusal(plan), null)
  setSwitch(true)
  const body = await publishRefusal(plan)
  assert.equal(body?.code, PUBLISH_VALIDATION_REFUSED)
  assert.deepEqual(body?.lineItemIds, ["test001SM1"])
})

test("savePlanVersion (POST /api/plans/save, ingest accept): on, a refused publish throws before the database", async () => {
  setSwitch(true)
  await assert.rejects(savePlanVersion(saveInput("publish"), untouchedDb), (err: unknown) => {
    assert.ok(err instanceof SavePlanError)
    assert.equal(err.code, "PUBLISH_VALIDATION_REFUSED")
    assert.deepEqual((err.details as { lineItemIds?: string[] }).lineItemIds, ["test001SM1"])
    return true
  })
})

test("savePlanVersion: off, or a draft or new version, goes on to the database", async () => {
  setSwitch(false)
  await assert.rejects(savePlanVersion(saveInput("publish"), untouchedDb), Reached)
  setSwitch(true)
  await assert.rejects(savePlanVersion(saveInput("draft"), untouchedDb), Reached)
  await assert.rejects(savePlanVersion(saveInput("new_version"), untouchedDb), Reached)
})

/** A database that answers only the version lines read, and fails on anything else. */
function versionLinesDb(rows: unknown[], seen: string[] = []) {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "execute") {
          return async () => {
            seen.push("execute")
            return rows
          }
        }
        throw new Reached(`the database was reached (${String(prop)})`)
      },
    },
  ) as unknown as Db
}

const storedOverlap = [
  {
    campaign_start_date: "2026-11-01",
    campaign_end_date: "2026-11-30",
    line_item_id: "test001TV1",
    channel: "television",
    buy_type: "spots",
    publisher: null,
    platform: null,
    attrs: { network: "Nine" },
    bursts: overlapping,
  },
]

test("publishRefusalForVersion: off reads nothing; on reads the stored lines; no version row is null", async () => {
  setSwitch(false)
  const seen: string[] = []
  assert.equal(await publishRefusalForVersion(versionLinesDb(storedOverlap, seen), { versionId: 9 }), null)
  assert.deepEqual(seen, [])
  setSwitch(true)
  const body = await publishRefusalForVersion(versionLinesDb(storedOverlap), { mbaNumber: "test001", versionNumber: 2 })
  assert.deepEqual(body?.publishProblems.map((p) => [p.rule, p.lineItemId, p.burst]), [["bursts_overlap", "test001TV1", 2]])
  assert.equal(await publishRefusalForVersion(versionLinesDb([]), { versionId: 9 }), null)
  const clean = [{ ...storedOverlap[0], bursts: [overlapping[0]] }]
  assert.equal(await publishRefusalForVersion(versionLinesDb(clean), { versionId: 9 }), null)
})

const revisionInput = {
  mbaNumber: "test001",
  baseVersionId: 9,
  expectedHash: "x",
  request: { mode: "bill_amount" as const, intoMonth: "2026-11", amountCents: 100, strategy: "earliest_first" as const },
  options: { unlockApprovedMonths: [], includeProduction: false, feeMode: "follow" as const, adservingMode: "keep" as const },
  reason: "Client asked",
  source: "ui" as const,
  actor: { teamMemberId: 7, name: "Test", email: "test@example.com" },
}

test("publishBillingRevision (billing revisions and true-ups): on, refused base lines are a 422 before the transaction", async () => {
  setSwitch(true)
  await assert.rejects(publishBillingRevision(revisionInput, versionLinesDb(storedOverlap)), (err: unknown) => {
    assert.ok(err instanceof BillingRevisionWriteError)
    assert.equal(err.code, "PUBLISH_VALIDATION_REFUSED")
    assert.equal(err.status, 422)
    assert.match(err.message, /test001TV1/)
    return true
  })
  setSwitch(false)
  await assert.rejects(publishBillingRevision(revisionInput, versionLinesDb(storedOverlap)), Reached)
})

test("publisher guard: with publish_validation on it leaves blank publishers to S1 and still blocks unknown names", async () => {
  const deps = (validationOn: boolean) => ({
    isOn: async () => true,
    loadPublishers: async () => [{ id: 1, publisher_name: "Nine", publisherid: "nine" }],
    publishValidationOn: async () => validationOn,
  })
  const lines = [
    { lineItemId: "PR1", channel: "production", publisher: "" },
    { lineItemId: "SM1", channel: "social", platform: "" },
  ]
  const before = await publisherGuardForSave("publish", lines, deps(false))
  assert.equal(before.reject, true)
  const after = await publisherGuardForSave("publish", lines, deps(true))
  assert.deepEqual(after, { reject: false, warnings: [] })
  const unknown = await publisherGuardForSave("publish", [{ lineItemId: "SM2", channel: "social", platform: "Nope" }], deps(true))
  assert.equal(unknown.reject, true)
})
