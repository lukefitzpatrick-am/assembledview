/**
 * S1 A (B54, B54fix): billing revisions and true-ups run the publish
 * validation set on the base version's stored lines before they publish, and
 * a credit-only revision (a "noted" change-log row, no version) is exempt
 * because it publishes nothing.
 *
 * The real publishBillingRevision, publishRefusalForVersion and switch reader
 * run; the revision context and plan are mocked, and the transaction answers
 * each execute from a queue so the test sees which reads ran.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import type { Db } from "@/db"
import type { FeatureRow } from "@/lib/features/registry"
import { setFeatureRowReaderForTests } from "@/lib/features/server"
import { mockModuleSkip, supportsMockModule } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

let afterCells: unknown[] = []

if (supportsMockModule()) {
  const realCtx = await import("@/lib/finance/revisions/loadRevisionContext")
  await mock.module!("@/lib/finance/revisions/loadRevisionContext", {
    namedExports: {
      ...realCtx,
      loadRevisionContext: async () => ({
        masterId: 1,
        mbaNumber: "test001",
        base: { id: 9, versionNumber: 2 },
        partial: false,
        unmatchedLineIds: [],
        lines: [],
      }),
      buildRevisionInput: () => ({}),
    },
  })
  const realPlan = await import("@/lib/finance/revisions/planBillingRevision")
  await mock.module!("@/lib/finance/revisions/planBillingRevision", {
    namedExports: {
      ...realPlan,
      planBillingRevision: () => ({ ok: true, hash: "x", afterCells, warnings: [], credits: [], movedCents: 0 }),
    },
  })
  const realModel = await import("@/lib/finance/revisions/revisionWriteModel")
  await mock.module!("@/lib/finance/revisions/revisionWriteModel", {
    namedExports: { ...realModel, revisionDiffPayload: () => ({}), restoreTargetFrom: () => ({}) },
  })
}

afterEach(() => setFeatureRowReaderForTests(null))

// publish_validation requires expert_package_quantity (V36 A), which requires fixed_cost_report_net.
const NEEDS = ["expert_package_quantity", "fixed_cost_report_net"]

const row = (on: boolean): FeatureRow => ({
  key: "publish_validation",
  enabled: on,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  note: null,
})

/** The base version's stored line: a burst after the plan end, so S1 refuses it. */
const brokenBase = [
  {
    campaign_start_date: "2026-11-01",
    campaign_end_date: "2026-11-30",
    line_item_id: "test001TV1",
    channel: "television",
    buy_type: "spots",
    publisher: null,
    platform: null,
    attrs: { network: "Nine" },
    bursts: [{ startDate: "2026-11-20", endDate: "2026-12-05", budget: 100, calculatedValue: 10 }],
  },
]
const cleanBase = [{ ...brokenBase[0], bursts: [{ startDate: "2026-11-01", endDate: "2026-11-30", budget: 100, calculatedValue: 10 }] }]

class PastTheCheck extends Error {}

/** execute answers from `queue` (then `[{ id: 5 }]`); anything else on the transaction means the path went on. */
function fakeDb(queue: unknown[][], executed: string[]) {
  const tx = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "execute") {
          return async () => {
            executed.push("execute")
            return queue.shift() ?? [{ id: 5 }]
          }
        }
        throw new PastTheCheck(`went on to tx.${String(prop)}`)
      },
    },
  )
  return { transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx) } as unknown as Db
}

const input = {
  mbaNumber: "test001",
  baseVersionId: 9,
  expectedHash: "x",
  request: { mode: "bill_amount" as const, intoMonth: "2026-11", amountCents: 100, strategy: "earliest_first" as const },
  options: { unlockApprovedMonths: [], includeProduction: false, feeMode: "follow" as const, adservingMode: "keep" as const },
  reason: "Client asked",
  source: "ui" as const,
  actor: { teamMemberId: 7, name: "Test", email: "test@example.com" },
}

async function run(on: boolean, cells: unknown[], queue: unknown[][]) {
  setFeatureRowReaderForTests(async () => new Map([["publish_validation", row(on)], ...NEEDS.map((key) => [key, { ...row(true), key }] as const)]))
  afterCells = cells
  const executed: string[] = []
  const { publishBillingRevision } = await import("@/lib/data/publishBillingRevision")
  const result = publishBillingRevision(input, fakeDb(queue, executed))
  return { result, executed }
}

test("on: a revision that publishes is refused (422) when the base lines break the rule", { skip }, async () => {
  const { BillingRevisionWriteError } = await import("@/lib/data/publishBillingRevision")
  const { result } = await run(true, [{ lineItemId: "test001TV1" }], [brokenBase])
  await assert.rejects(result, (err: unknown) => {
    assert.ok(err instanceof BillingRevisionWriteError)
    assert.equal(err.code, "PUBLISH_VALIDATION_REFUSED")
    assert.equal(err.status, 422)
    assert.match(err.message, /test001TV1, burst 1 runs outside the plan dates \(2026-11-01 to 2026-11-30\)/)
    return true
  })
})

test("on: a revision that publishes clean base lines goes on past the check", { skip }, async () => {
  const { result } = await run(true, [{ lineItemId: "test001TV1" }], [cleanBase])
  await assert.rejects(result, PastTheCheck)
})

test("on: a credit-only revision is noted and reads no version lines", { skip }, async () => {
  const { result, executed } = await run(true, [], [])
  const res = await result
  assert.equal(res.status, "noted")
  // The revision row and the notification only; no version lines read.
  assert.deepEqual(executed, ["execute", "execute"])
})

test("off: a revision that publishes reads no lines and goes on", { skip }, async () => {
  const { result, executed } = await run(false, [{ lineItemId: "test001TV1" }], [brokenBase])
  await assert.rejects(result, PastTheCheck)
  assert.deepEqual(executed, [])
})
