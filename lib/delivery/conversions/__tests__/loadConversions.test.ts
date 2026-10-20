import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip, supportsMockModule } from "../../../test/mockModuleHarness.js"

// The real repo and Snowflake modules open clients on import; every test injects deps instead.
const skip = mockModuleSkip()
if (supportsMockModule()) {
  await mock.module!("@/lib/clients/conversionSettingsRepo", {
    namedExports: { readConversionConfigForMba: async () => null },
  })
  await mock.module!("@/lib/snowflake/conversions", {
    namedExports: { queryConversionRows: async () => [] },
  })
}

async function load() {
  return (await import("../loadConversions")).loadConversionsForLines
}

const ON = {
  clientId: 1,
  settings: { enabled: true, headline: "purchases" as const, showRevenue: true },
  events: [
    { platform: "meta_ads" as const, eventKey: "purchase", label: null, category: "purchase" as const, includeValue: true },
  ],
}

const ROWS = [
  { lineItemId: "curatif004sm1", date: "2026-10-05", platform: "meta_ads", eventKey: "purchase", conversions: 4, conversionValue: 400 },
  { lineItemId: "curatif004sm1", date: "2026-10-05", platform: "meta_ads", eventKey: "omni_purchase", conversions: 4, conversionValue: 400 },
]

test("switch off: null and no Snowflake read", { skip }, async () => {
  const loadConversionsForLines = await load()
  let queried = 0
  const out = await loadConversionsForLines(
    { mbaNumber: "curatif004", lineItemIds: ["curatif004sm1"], startDate: "2026-10-01", endDate: "2026-10-31" },
    {
      readConfig: async () => ({ ...ON, settings: { ...ON.settings, enabled: false } }) as never,
      query: async () => {
        queried++
        return []
      },
    },
  )
  assert.equal(out, null)
  assert.equal(queried, 0)
})

test("switch on: window capped at Melbourne yesterday, chosen events only", { skip }, async () => {
  const loadConversionsForLines = await load()
  let args: { startDate: string; endDate: string; lineItemIds: readonly string[] } | null = null
  const out = await loadConversionsForLines(
    { mbaNumber: "curatif004", lineItemIds: ["CURATIF004SM1", "curatif004sm1"], startDate: "2026-10-01", endDate: "2026-10-31" },
    {
      readConfig: async () => ON as never,
      query: async (a) => {
        args = a
        return ROWS
      },
      yesterdayISO: () => "2026-10-20",
    },
  )
  assert.ok(out)
  assert.equal(args!.startDate, "2026-10-01")
  assert.equal(args!.endDate, "2026-10-20")
  assert.deepEqual(args!.lineItemIds, ["curatif004sm1"])
  assert.equal(out.throughDate, "2026-10-20")
  assert.deepEqual(out.valuePlatforms, ["meta_ads"])
  assert.equal(out.lines[0]!.daily[0]!.purchases, 4, "omni_purchase is not double counted")
  assert.equal(out.lines[0]!.daily[0]!.revenue, 400)
})

test("a window that starts after yesterday reads nothing", { skip }, async () => {
  const loadConversionsForLines = await load()
  let queried = 0
  const out = await loadConversionsForLines(
    { mbaNumber: "curatif004", lineItemIds: ["curatif004sm1"], startDate: "2026-10-21", endDate: "2026-10-31" },
    {
      readConfig: async () => ON as never,
      query: async () => {
        queried++
        return ROWS
      },
      yesterdayISO: () => "2026-10-20",
    },
  )
  assert.equal(queried, 0)
  assert.deepEqual(out?.lines, [])
})
