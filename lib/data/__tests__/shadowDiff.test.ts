import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"
import {
  getDataBackend,
  getDataBackendFor,
  getPlanDetailBackend,
  getWriteBackend,
} from "../backend"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  dollarsToCents,
  KPI_RATE_EPSILON,
  normalizeComparableValue,
  recordShadowDiff,
  summarizeShadowDiffs,
  valuesEqualForCompare,
} from "../shadowDiff"

describe("getWriteBackend", () => {
  let prev: string | undefined

  beforeEach(() => {
    prev = process.env.WRITE_BACKEND
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.WRITE_BACKEND
    else process.env.WRITE_BACKEND = prev
  })

  it("defaults to xano and is independent of DATA_BACKEND", () => {
    delete process.env.WRITE_BACKEND
    process.env.DATA_BACKEND = "postgres"
    assert.equal(getWriteBackend(), "xano")
  })

  it("accepts postgres", () => {
    process.env.WRITE_BACKEND = "POSTGRES"
    assert.equal(getWriteBackend(), "postgres")
  })

  it("falls back to xano on unknown values", () => {
    process.env.WRITE_BACKEND = "mysql"
    assert.equal(getWriteBackend(), "xano")
  })
})

describe("getDataBackend", () => {
  let prev: string | undefined

  beforeEach(() => {
    prev = process.env.DATA_BACKEND
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.DATA_BACKEND
    else process.env.DATA_BACKEND = prev
  })

  it("defaults to xano", () => {
    delete process.env.DATA_BACKEND
    assert.equal(getDataBackend(), "xano")
  })

  it("accepts shadow and postgres", () => {
    process.env.DATA_BACKEND = "shadow"
    assert.equal(getDataBackend(), "shadow")
    process.env.DATA_BACKEND = "POSTGRES"
    assert.equal(getDataBackend(), "postgres")
  })

  it("falls back to xano on unknown values", () => {
    process.env.DATA_BACKEND = "mysql"
    assert.equal(getDataBackend(), "xano")
  })
})

describe("getDataBackendFor", () => {
  const keys = [
    "DATA_BACKEND",
    "DATA_BACKEND_REFERENCE",
    "DATA_BACKEND_PUBLISHERS",
    "DATA_BACKEND_CLIENTS",
    "DATA_BACKEND_KPI",
    "DATA_BACKEND_FINANCE",
    "DATA_BACKEND_PACING",
    "DATA_BACKEND_PLANS",
    "DATA_BACKEND_APPROVALS",
  ] as const
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  })

  it("falls back to global DATA_BACKEND when domain env unset", () => {
    delete process.env.DATA_BACKEND_PUBLISHERS
    process.env.DATA_BACKEND = "shadow"
    assert.equal(getDataBackendFor("publishers"), "shadow")
  })

  it("uses DATA_BACKEND_<DOMAIN> over global", () => {
    process.env.DATA_BACKEND = "xano"
    process.env.DATA_BACKEND_PUBLISHERS = "shadow"
    process.env.DATA_BACKEND_CLIENTS = "postgres"
    process.env.DATA_BACKEND_KPI = "shadow"
    process.env.DATA_BACKEND_FINANCE = "shadow"
    process.env.DATA_BACKEND_PLANS = "shadow"
    process.env.DATA_BACKEND_APPROVALS = "shadow"
    assert.equal(getDataBackendFor("publishers"), "shadow")
    assert.equal(getDataBackendFor("clients"), "postgres")
    assert.equal(getDataBackendFor("kpi"), "shadow")
    assert.equal(getDataBackendFor("finance"), "shadow")
    assert.equal(getDataBackendFor("plans"), "shadow")
    assert.equal(getDataBackendFor("approvals"), "shadow")
    assert.equal(getDataBackendFor("reference"), "xano")
  })

  it("treats empty domain env as unset (falls back)", () => {
    process.env.DATA_BACKEND = "postgres"
    process.env.DATA_BACKEND_REFERENCE = "   "
    assert.equal(getDataBackendFor("reference"), "postgres")
  })
})

describe("getPlanDetailBackend (C-22)", () => {
  const keys = ["DATA_BACKEND_PLAN_DETAIL", "DATA_BACKEND"] as const
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k]
  })

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
  })

  it("defaults to xano (inert — route stays on Xano fan-out)", () => {
    delete process.env.DATA_BACKEND_PLAN_DETAIL
    assert.equal(getPlanDetailBackend(), "xano")
  })

  it("does NOT fall back to global DATA_BACKEND", () => {
    delete process.env.DATA_BACKEND_PLAN_DETAIL
    process.env.DATA_BACKEND = "postgres"
    assert.equal(getPlanDetailBackend(), "xano")
  })

  it("honours DATA_BACKEND_PLAN_DETAIL=postgres", () => {
    process.env.DATA_BACKEND_PLAN_DETAIL = "postgres"
    assert.equal(getPlanDetailBackend(), "postgres")
  })
})

describe("normalizeComparableValue", () => {
  it("normalizes unix seconds and ISO strings to the same ISO", () => {
    const iso = "2024-01-15T00:00:00.000Z"
    const seconds = Math.floor(Date.parse(iso) / 1000)
    assert.equal(normalizeComparableValue(seconds), iso)
    assert.equal(normalizeComparableValue(iso), iso)
  })

  it("treats numeric strings as numbers (including 11-digit ABNs)", () => {
    assert.equal(normalizeComparableValue("50"), 50)
    assert.equal(normalizeComparableValue(50), 50)
    assert.equal(normalizeComparableValue("82619485353"), 82619485353)
    assert.equal(normalizeComparableValue(82619485353), 82619485353)
  })

  it("treats empty string and epoch-zero timestamps as null", () => {
    assert.equal(normalizeComparableValue(""), null)
    assert.equal(normalizeComparableValue(0), null)
    assert.equal(normalizeComparableValue("1970-01-01 00:00:00+00"), null)
  })
})

describe("compareReferenceRows + shadow store", () => {
  beforeEach(() => {
    __resetShadowDiffStoreForTests()
  })

  it("detects missing ids and field mismatches", () => {
    const event = compareReferenceRows(
      "tv_stations",
      [
        { id: 1, station: "ABC", network: "Seven" },
        { id: 2, station: "OnlyXano", network: "Nine" },
      ],
      [
        { id: 1, station: "ABC", network: "Ten" },
        { id: 3, station: "OnlyPg", network: "Seven" },
      ],
      { domain: "reference" }
    )
    assert.equal(event.domain, "reference")
    assert.deepEqual(event.missingInPostgres, [2])
    assert.deepEqual(event.missingInXano, [3])
    assert.equal(event.fieldDiffs.length, 1)
    assert.equal(event.fieldDiffs[0]!.id, 1)
    assert.equal(event.fieldDiffs[0]!.fields[0]!.field, "network")
  })

  it("treats null vs absent as equal", () => {
    const event = compareReferenceRows(
      "publishers",
      [{ id: 1, publisher_name: "A" }],
      [{ id: 1, publisher_name: "A", billingagency: null }],
      { domain: "publishers" }
    )
    assert.equal(event.fieldDiffs.length, 0)
  })

  it("postgresKeysOnly skips Xano-only fields not present on Postgres rows", () => {
    const event = compareReferenceRows(
      "publishers",
      [{ id: 1, publisher_name: "Acme", not_yet_ported: "x" }],
      [{ id: 1, publisher_name: "Acme" }],
      { domain: "publishers", postgresKeysOnly: true }
    )
    assert.equal(event.fieldDiffs.length, 0)
  })

  it("full clients compare surfaces Xano-only fields when not postgresKeysOnly", () => {
    const event = compareReferenceRows(
      "clients",
      [{ id: 1, mp_client_name: "Acme", facebook_url: "https://fb.example", abn: 123 }],
      [{ id: 1, mp_client_name: "Acme", abn: "123" }],
      { domain: "clients" }
    )
    assert.equal(event.fieldDiffs.length, 1)
    assert.equal(event.fieldDiffs[0]!.fields[0]!.field, "facebook_url")
  })

  it("summarizes last-24h events by table and domain", () => {
    const event = compareReferenceRows(
      "radio_stations",
      [{ id: 1, station: "A" }],
      [{ id: 1, station: "B" }],
      { domain: "reference" }
    )
    recordShadowDiff(event)
    const pub = compareReferenceRows(
      "publishers",
      [{ id: 1, publisher_name: "X" }],
      [{ id: 1, publisher_name: "Y" }],
      { domain: "publishers" }
    )
    recordShadowDiff(pub)

    const summary = summarizeShadowDiffs()
    assert.equal(summary.eventCount, 2)
    assert.equal(summary.byDomain.length, 2)
    assert.equal(summary.byDomain.find((d) => d.domain === "publishers")?.events, 1)
    assert.equal(summary.byTable.length, 2)
    assert.equal(summary.byTable.find((t) => t.table === "radio_stations")?.domain, "reference")
    assert.equal(summary.byTable.find((t) => t.table === "radio_stations")!.lastEvent.rowsWithFieldDiffs, 1)
  })

  it("kpiNumericCompare: money in cents, rates within epsilon", () => {
    assert.equal(dollarsToCents(1.234), 123)
    assert.equal(dollarsToCents("2.005"), 201)

    const moneyOpts = { kpiNumericCompare: true }
    assert.equal(
      valuesEqualForCompare("cpv", 1.0, 1.009, moneyOpts),
      true,
      "cpv within 1 cent"
    )
    assert.equal(
      valuesEqualForCompare("cpv", 1.0, 1.02, moneyOpts),
      false,
      "cpv beyond 1 cent"
    )

    const rateOpts = { kpiNumericCompare: true, rateEpsilon: KPI_RATE_EPSILON }
    assert.equal(
      valuesEqualForCompare("ctr", 0.05, 0.0500000005, rateOpts),
      true,
      "ctr within epsilon"
    )
    assert.equal(
      valuesEqualForCompare("vtr", 0.1, 0.10001, rateOpts),
      false,
      "vtr beyond epsilon"
    )

    const event = compareReferenceRows(
      "campaign_kpi",
      [{ id: 1, cpv: 1.0, ctr: 0.05 }],
      [{ id: 1, cpv: 1.009, ctr: 0.0500000005 }],
      { domain: "kpi", kpiNumericCompare: true }
    )
    assert.equal(event.fieldDiffs.length, 0)

    const eventMismatch = compareReferenceRows(
      "campaign_kpi",
      [{ id: 1, cpv: 1.0, ctr: 0.05 }],
      [{ id: 1, cpv: 1.02, ctr: 0.05 }],
      { domain: "kpi", kpiNumericCompare: true }
    )
    assert.equal(eventMismatch.fieldDiffs.length, 1)
    assert.equal(eventMismatch.fieldDiffs[0]!.fields[0]!.field, "cpv")
  })

  it("finance duplicate-class: extras sharing invoice_key tagged EXPECTED", () => {
    const event = compareReferenceRows(
      "finance_billing_records",
      [
        { id: 1, invoice_key: "media:MBA001:2026-01", total: 100 },
        { id: 2, invoice_key: "media:MBA001:2026-01", total: 100 },
      ],
      [{ id: 1, invoice_key: "media:MBA001:2026-01", total: 100 }],
      { domain: "finance", financeDuplicateClass: true, postgresKeysOnly: true }
    )
    assert.deepEqual(event.missingInPostgres, [2])
    assert.deepEqual(event.duplicateClassMissingInPostgres, [2])
    assert.equal(event.diffClass, "duplicate-class")
    assert.equal(event.fieldDiffs.length, 0)

    recordShadowDiff(event)
    const summary = summarizeShadowDiffs()
    const finance = summary.byDomain.find((d) => d.domain === "finance")
    assert.ok(finance)
    assert.equal(finance!.totalDuplicateClassMissingInPostgres, 1)
    assert.equal(finance!.totalUnexpectedMissingInPostgres, 0)
  })
})
