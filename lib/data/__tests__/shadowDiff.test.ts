import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"
import { getDataBackend, getDataBackendFor } from "../backend"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  normalizeComparableValue,
  recordShadowDiff,
  summarizeShadowDiffs,
} from "../shadowDiff"

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
    assert.equal(getDataBackendFor("publishers"), "shadow")
    assert.equal(getDataBackendFor("clients"), "postgres")
    assert.equal(getDataBackendFor("reference"), "xano")
  })

  it("treats empty domain env as unset (falls back)", () => {
    process.env.DATA_BACKEND = "postgres"
    process.env.DATA_BACKEND_REFERENCE = "   "
    assert.equal(getDataBackendFor("reference"), "postgres")
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
})
