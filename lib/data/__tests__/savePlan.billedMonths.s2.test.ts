/**
 * S2 A (B56): the plan save publish runs the billed months gate. The real
 * savePlanVersion runs against an in-memory database that answers each query
 * and records the writes; the published tip and its invoiced months come from
 * a mocked loader. A publish that stops calling the gate fails here.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import type { Db } from "@/db"
import { schema } from "@/db"
import type { FeatureRow } from "@/lib/features/registry"
import { setFeatureRowReaderForTests } from "@/lib/features/server"
import { mockModuleSkip, supportsMockModule } from "@/lib/test/mockModuleHarness"
import { explodeScheduleToMonthRows } from "@/scripts/migration/_scheduleTransform"

const skip = mockModuleSkip()

type Base = { versionId: number; schedule: unknown; rows: Array<Record<string, unknown>> }
let tip: Base | null = null
let loads = 0

if (supportsMockModule()) {
  await mock.module!("@/lib/finance/billedMonths/load", {
    namedExports: {
      loadBilledMonthsBase: async () => {
        loads++
        return { base: tip, invoiced: tip ? [{ month: "2026-09", reasons: ["xero_matched"] }] : [] }
      },
    },
  })
  await mock.module!("@/lib/data/lineIdHistory", {
    namedExports: { loadMasterLineIdHistory: async () => ({ versions: [], rows: [] }) },
  })
}

const { SavePlanError, savePlanVersion } = await import("@/lib/data/savePlan")
type Input = Parameters<typeof savePlanVersion>[0]

afterEach(() => {
  setFeatureRowReaderForTests(null)
  tip = null
  loads = 0
})

const row = (key: string, enabled: boolean): FeatureRow => ({
  key,
  enabled,
  updatedAt: null,
  updatedBy: null,
  updatedByName: null,
  note: null,
})

function setSwitch(on: boolean) {
  setFeatureRowReaderForTests(async () => new Map([["billed_months_choice", row("billed_months_choice", on)]]))
}

type Write = { kind: "insert" | "update"; table: unknown; value: unknown }

/** Answers every query savePlanVersion makes; records inserts and updates. */
function memoryDb(writes: Write[]): Db {
  const chain = (result: () => unknown, onCall?: (prop: string, args: unknown[]) => void): unknown => {
    const target = () => undefined
    const proxy: unknown = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej)
        }
        return (...args: unknown[]) => {
          onCall?.(String(prop), args)
          return proxy
        }
      },
    })
    return proxy
  }
  const api = {
    select: (fields: Record<string, unknown> = {}) => {
      const keys = Object.keys(fields)
      return chain(() => {
        if (keys.includes("maxVn")) return [{ maxVn: 3 }]
        if (keys.includes("campaignStatus")) return [{ campaignStatus: "booked" }]
        if (keys.includes("n")) return [{ n: 1 }]
        if (keys.includes("approvedSlice")) return [{ approvedSlice: null }]
        if (keys.includes("publishedAt")) return [{ id: 1, versionNumber: 3, publishedAt: null }]
        if (keys.length === 1 && keys[0] === "id") return [{ id: 1 }]
        return []
      })
    },
    insert: (table: unknown) => {
      let returning = false
      return chain(
        () => (returning ? [{ id: 7 }] : undefined),
        (prop, args) => {
          if (prop === "values") writes.push({ kind: "insert", table, value: args[0] })
          if (prop === "returning") returning = true
        },
      )
    },
    update: (table: unknown) =>
      chain(
        () => undefined,
        (prop, args) => {
          if (prop === "set") writes.push({ kind: "update", table, value: args[0] })
        },
      ),
    delete: () => chain(() => undefined),
    execute: async () => [],
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api),
  }
  return api as unknown as Db
}

const input = (amount: number, over: Partial<Input> = {}): Input => ({
  masterId: 1,
  mbaNumber: "test001",
  versionNumber: 3,
  mode: "publish",
  campaignStartDate: "2026-09-01",
  campaignEndDate: "2026-10-31",
  feeLoading: {},
  lineItems: [
    {
      lineItemId: "test001SM1",
      channel: "social",
      platform: "Meta",
      buyType: "fixed_cost",
      mediaType: "socialMedia",
      rate: 0,
      enteredAmount: amount,
      bursts: [{ startDate: "2026-09-01", endDate: "2026-10-31", budget: amount, buyAmount: amount, calculatedValue: 1 }],
      attrs: {},
    },
  ],
  ...over,
})

type Saved = { schedule: unknown; billing: Array<{ lineItemId: string; component: string; month: string; amountCents: number; source?: string }> }

function saved(writes: Write[]): Saved {
  const blob = writes.filter((w) => w.kind === "update" && (w.value as { legacySchedules?: unknown }).legacySchedules)
  const rows = writes
    .filter((w) => w.kind === "insert" && w.table === schema.scheduleMonths)
    .flatMap((w) => w.value as Saved["billing"])
  return {
    schedule: (blob.at(-1)?.value as { legacySchedules: { billingSchedule: unknown } } | undefined)?.legacySchedules.billingSchedule,
    billing: rows.filter((r) => (r as { basis?: string }).basis === "billing"),
  }
}

const cents = (rows: Saved["billing"], month: string) =>
  rows.filter((r) => r.month.startsWith(month) && r.component === "media").reduce((s, r) => s + r.amountCents, 0)

/** The published tip: the same plan saved with a $6,100 budget (switch off). */
async function publishedTip(): Promise<Base> {
  setSwitch(false)
  const writes: Write[] = []
  await savePlanVersion(input(6100), memoryDb(writes))
  const s = saved(writes)
  return {
    versionId: 6,
    schedule: s.schedule,
    rows: s.billing.map((r) => ({ ...r, month: r.month.slice(0, 7), source: "override" })),
  }
}

test("off: nothing is read and the new version's billing is written for the invoiced month", { skip }, async () => {
  tip = await publishedTip()
  setSwitch(false)
  const writes: Write[] = []
  await savePlanVersion(input(3050), memoryDb(writes))
  assert.equal(loads, 0)
  assert.equal(cents(saved(writes).billing, "2026-09"), 150000)
})

test("on, no choice: 409 code names the invoiced month and nothing is scheduled", { skip }, async () => {
  tip = await publishedTip()
  setSwitch(true)
  const writes: Write[] = []
  await assert.rejects(
    () => savePlanVersion(input(3050), memoryDb(writes)),
    (e: unknown) => {
      assert.ok(e instanceof SavePlanError)
      assert.equal(e.code, "BILLED_MONTHS_CHOICE_REQUIRED")
      const months = (e.details?.billedMonths ?? []) as Array<{ month: string; baseCents: number; candidateCents: number }>
      assert.deepEqual(
        months.map((m) => [m.month, m.baseCents, m.candidateCents]),
        [["2026-09", 300000, 150000]],
      )
      return true
    },
  )
  assert.equal(loads, 1)
  assert.equal(saved(writes).billing.length, 0)
})

test("on, credit: refused until S11; nothing is scheduled", { skip }, async () => {
  tip = await publishedTip()
  setSwitch(true)
  const writes: Write[] = []
  await assert.rejects(
    () => savePlanVersion(input(3050, { billedMonthsChoice: "credit" }), memoryDb(writes)),
    (e: unknown) => e instanceof SavePlanError && e.code === "BILLED_MONTHS_CREDIT_UNAVAILABLE",
  )
  assert.equal(saved(writes).billing.length, 0)
})

test("on, keep: the invoiced month keeps the tip's rows and blob; later months follow the new version", { skip }, async () => {
  tip = await publishedTip()
  setSwitch(true)
  const writes: Write[] = []
  const result = await savePlanVersion(input(3050, { billedMonthsChoice: "keep" }), memoryDb(writes))
  assert.equal(result.published, true)
  const s = saved(writes)
  assert.equal(cents(s.billing, "2026-09"), 300000)
  assert.equal(cents(s.billing, "2026-10"), 155000)
  assert.ok(s.billing.filter((r) => r.month.startsWith("2026-09")).every((r) => r.source === "override"))
  const blob = explodeScheduleToMonthRows(7, "billing", s.schedule).rows
  assert.equal(cents(blob, "2026-09"), 300000)
  assert.equal(cents(blob, "2026-10"), 155000)
  const slice = writes.find((w) => w.kind === "update" && (w.value as { approvedSlice?: unknown }).approvedSlice)
  const sliceValue = (slice?.value as { approvedSlice: { totalCents: number } }).approvedSlice
  assert.equal(sliceValue.totalCents, 455000)
})

test("on, nothing invoiced changes: goes on without a choice", { skip }, async () => {
  tip = await publishedTip()
  setSwitch(true)
  const writes: Write[] = []
  await savePlanVersion(input(6100), memoryDb(writes))
  assert.equal(loads, 1)
  assert.equal(cents(saved(writes).billing, "2026-09"), 300000)
})

test("on, a draft is not a publish: nothing is read", { skip }, async () => {
  tip = await publishedTip()
  setSwitch(true)
  const writes: Write[] = []
  await savePlanVersion(input(3050, { mode: "draft" }), memoryDb(writes))
  assert.equal(loads, 0)
})

const withFee = (amount: number, over: Partial<Input> = {}): Input => {
  const base = input(amount, over)
  return { ...base, lineItems: base.lineItems.map((l) => ({ ...l, feePct: 10 })) }
}

/** Billing rows per month and component: `line|component|cents`, sorted. */
const rowsIn = (rows: Saved["billing"], month: string) =>
  rows
    .filter((r) => r.month.startsWith(month))
    .map((r) => `${r.lineItemId}|${r.component}|${r.amountCents}`)
    .sort()

test("on, keep with a fee line: kept month writes the tip's media and fee rows once; later months the new version's (B56fix R4)", { skip }, async () => {
  setSwitch(false)
  const tipWrites: Write[] = []
  await savePlanVersion(withFee(6100), memoryDb(tipWrites))
  const tipSaved = saved(tipWrites)
  tip = { versionId: 6, schedule: tipSaved.schedule, rows: tipSaved.billing.map((r) => ({ ...r, month: r.month.slice(0, 7) })) }
  setSwitch(false)
  const newWrites: Write[] = []
  await savePlanVersion(withFee(3050), memoryDb(newWrites))
  const fresh = saved(newWrites).billing

  setSwitch(true)
  const writes: Write[] = []
  const result = await savePlanVersion(withFee(3050, { billedMonthsChoice: "keep" }), memoryDb(writes))
  assert.equal(result.published, true)
  const s = saved(writes).billing
  assert.ok(rowsIn(tipSaved.billing, "2026-09").some((r) => r.includes("|fee|")), "the tip bills a fee in Sep")
  assert.deepEqual(rowsIn(s, "2026-09"), rowsIn(tipSaved.billing, "2026-09"))
  assert.deepEqual(rowsIn(s, "2026-10"), rowsIn(fresh, "2026-10"))
  const keys = s.map((r) => `${r.lineItemId}|${r.component}|${r.month}`)
  assert.equal(new Set(keys).size, keys.length)
})
