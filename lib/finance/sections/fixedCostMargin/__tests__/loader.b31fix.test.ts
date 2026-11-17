/**
 * B31fix L5: a runtime test of the fixed cost margin loader
 * (`fetchFinanceFixedCostMargin`) with Postgres and Snowflake mocked.
 *
 * Pins what the source regexes could not:
 * - on the pacing-facts fallback the day view is never read and the date's
 *   month stays unsplit (the guard in `loadPreDateSpend`);
 * - an unsplit month adds the "not split" note to the payload;
 * - a day view error leaves the month unsplit, never fails the report;
 * - the cost before the date is capped at the month's cost (L4) end to end;
 * - with the switch off the date is not read, the day view is not queried
 *   and the notes are the base notes.
 *
 * Run with `--experimental-test-module-mocks` (test:fixed-cost-margin).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { PgDialect } from "drizzle-orm/pg-core"

import { mockModuleSkip, supportsMockModule } from "../../../../test/mockModuleHarness.js"
import { BOSS_FROM, BOSS_LINES, bossPlan, bossPreDateSpend, bossSpend } from "./fixtures/bossFc9.js"

const skip = mockModuleSkip()
const dialect = new PgDialect()

type State = {
  /** fixed_cost_from on every plan row (the SQL only selects it when on). */
  fixedCostFrom: string | null
  /** The month view is missing: the loader falls back to the pacing facts. */
  viewMissing: boolean
  /** The day view throws. */
  dayViewError: boolean
  /** Day view rows (dollars) by lowercase line id; default the BOSS 1 to 29 Oct figures. */
  preDate: Map<string, number>
  /** "lid|YYYY-MM" spend rows left out (C-185: a billed month with no spend). */
  dropSpend: Set<string>
}

const state: State = { fixedCostFrom: null, viewMissing: false, dayViewError: false, preDate: new Map(), dropSpend: new Set() }
const pgQueries: string[] = []
const sfCalls: Array<{ label: string; sql: string; binds: unknown[] }> = []

function planRows(): Record<string, unknown>[] {
  return bossPlan().map((c) => ({
    client_id: c.clientId,
    client_name: c.clientName,
    mba_number: c.mbaNumber,
    campaign_name: c.campaignName,
    campaign_status: c.campaignStatus,
    line_item_id: c.lineItemId,
    line_name: c.lineName,
    publisher: c.publisher,
    platform: c.platform,
    channel: c.channel,
    buy_type: c.buyType,
    fixed_cost_media: c.fixedCostMedia,
    basis: c.basis,
    month: c.month,
    amount_cents: String(c.amountCents),
    fixed_cost_from: state.fixedCostFrom,
  }))
}

const execute = mock.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
  const text = dialect.sqlToQuery(query).sql
  pgQueries.push(text)
  if (/FROM media_plan_masters m\s+INNER JOIN media_plan_versions v/.test(text) && /fixed_cost_media, FALSE\) = TRUE/.test(text)) {
    return { rows: planRows() }
  }
  if (/FROM publishers/.test(text)) {
    return {
      rows: [
        { id: 2, publisher_name: "DV360", publisherid: "dav360", billingagency: "assembled media" },
        { id: 14, publisher_name: "Taboola", publisherid: "tabool", billingagency: "assembled media" },
      ],
    }
  }
  if (/LOWER\(BTRIM\(m\.mba_number\)\) AS mba, m\.client_id/.test(text)) {
    return { rows: [{ mba: "boss010", client_id: 24, client_name: "Boss" }, { mba: "boss011", client_id: 24, client_name: "Boss" }] }
  }
  // finance_billing_records, xero_ap_bills, anything else: nothing.
  return { rows: [] }
})

const querySnowflake = mock.fn(async (sql: string, binds: unknown[] = [], opts: { label?: string } = {}) => {
  const label = opts.label ?? ""
  sfCalls.push({ label, sql, binds })
  const spendRows = () =>
    bossSpend().filter((c) => !state.dropSpend.has(`${c.lineItemId}|${c.month}`)).map((c) => ({
      LINE_ITEM_ID: c.lineItemId,
      MONTH: c.month,
      SOURCE: label === "fixed_cost_margin_spend_fallback" ? `Pacing fact (${c.source})` : c.source,
      AMOUNT_SPENT: c.spendCents / 100,
      IMPRESSIONS: c.impressions,
      ROW_COUNT: c.rowCount,
    }))
  if (label === "fixed_cost_margin_spend_view") {
    if (state.viewMissing) throw new Error("SQL compilation error: Object 'VW_PLATFORM_SPEND_LINE_MONTH' does not exist or not authorized.")
    return spendRows()
  }
  if (label === "fixed_cost_margin_spend_fallback") return spendRows()
  if (label === "fixed_cost_margin_pre_date_spend") {
    if (state.dayViewError) throw new Error("Object 'VW_PLATFORM_SPEND_LINE_DAY' does not exist or not authorized.")
    return [...state.preDate.entries()].map(([id, dollars]) => ({ LINE_ITEM_ID: id.toUpperCase(), AMOUNT_SPENT: dollars }))
  }
  return []
})

if (supportsMockModule()) {
  const schema = await import("@/db/schema")
  await mock.module!("@/db", {
    namedExports: {
      getDb: () => ({ execute }),
      getClient: () => {
        throw new Error("no client in tests")
      },
      db: {},
      closeDb: async () => {},
      discardHungPostgresClient: async () => {},
      schema,
    },
  })
  await mock.module!("@/lib/snowflake/query", { namedExports: { querySnowflake } })
  await mock.module!("@/lib/finance/sections/fixedCostMargin/manualMatches", {
    namedExports: {
      ManualMatchError: class ManualMatchError extends Error {},
      listSavedBillLineMatches: async () => [],
      loadMatchPlanLines: async () => [],
      createSavedBillLineMatch: async () => {
        throw new Error("not in tests")
      },
      deleteSavedBillLineMatch: async () => {},
    },
  })
}

const Q = { fy: 2026, from: "2026-08", to: "2026-11", clientIds: [] as number[] }

async function load(opts: { fc9: boolean; noSpend?: boolean; now?: Date } & Partial<State>) {
  const { setFeatureRowReaderForTests } = await import("@/lib/features/server")
  const row = (key: string, enabled: boolean) => [
    key,
    { key, enabled, updatedAt: null, updatedBy: null, updatedByName: null, note: null },
  ] as const
  setFeatureRowReaderForTests(
    async () =>
      new Map([
        row("fixed_cost_margin_from_date", opts.fc9),
        row("fixed_cost_from_date", true),
        row("fixed_cost_report_net", true),
        row("fixed_cost_margin_no_spend_yet", opts.noSpend ?? false),
      ]),
  )
  state.fixedCostFrom = opts.fixedCostFrom === undefined ? BOSS_FROM : opts.fixedCostFrom
  state.viewMissing = opts.viewMissing ?? false
  state.dayViewError = opts.dayViewError ?? false
  state.preDate = opts.preDate ?? new Map(BOSS_LINES.map((l) => [l.id.toLowerCase(), l.preOctCents / 100]))
  state.dropSpend = opts.dropSpend ?? new Set()
  pgQueries.length = 0
  sfCalls.length = 0
  const warn = console.warn
  console.warn = () => {}
  try {
    const { fetchFinanceFixedCostMargin } = await import("../query.js")
    const now = opts.now
    return await fetchFinanceFixedCostMargin(Q, now ? { now: () => now } : {})
  } finally {
    console.warn = warn
    setFeatureRowReaderForTests(null)
  }
}

const dayViewCalls = () => sfCalls.filter((c) => c.label === "fixed_cost_margin_pre_date_spend")
const oct = (p: Awaited<ReturnType<typeof load>>, lid: string) =>
  p.lines.find((l) => l.lineItemId.toLowerCase() === lid)!.months.find((m) => m.month === "2026-10")!

test("month view, switch on: the day view is read once for the four lines and October splits", { skip }, async () => {
  const { FIXED_COST_FROM_NOTES, FIXED_COST_FROM_UNSPLIT_NOTE } = await import("../compose.js")
  const p = await load({ fc9: true })
  assert.equal(p.spendSource.mode, "line_month_view")
  assert.equal(dayViewCalls().length, 1)
  assert.deepEqual(dayViewCalls()[0]!.binds, [
    "boss010pd1", "2026-10-01", BOSS_FROM,
    "boss010pd2", "2026-10-01", BOSS_FROM,
    "boss011pd1", "2026-10-01", BOSS_FROM,
    "boss011pd2", "2026-10-01", BOSS_FROM,
  ])
  assert.match(pgQueries.find((q) => /fixed_cost_media, FALSE\) = TRUE/.test(q))!, /li\.fixed_cost_from::text AS fixed_cost_from/)
  for (const l of BOSS_LINES) assert.equal(oct(p, l.id.toLowerCase()).legs?.kind, "split", l.id)
  const pd2 = oct(p, "boss010pd2").legs
  assert.deepEqual(pd2, {
    kind: "split",
    before: { billedCents: 59097, actualCents: 59097, marginCents: 0 },
    from: { billedCents: 76903, actualCents: 4891, marginCents: 72012 },
  })
  for (const n of FIXED_COST_FROM_NOTES) assert.ok(p.notes.includes(n))
  assert.ok(!p.notes.includes(FIXED_COST_FROM_UNSPLIT_NOTE))
  assert.equal(p.summary.grand.marginCents, 484399)
})

test("pacing-facts fallback, switch on: the day view is never read; October unsplit with the note", { skip }, async () => {
  const { FIXED_COST_FROM_UNSPLIT_NOTE } = await import("../compose.js")
  const p = await load({ fc9: true, viewMissing: true })
  assert.equal(p.spendSource.mode, "pacing_facts_fallback")
  assert.equal(dayViewCalls().length, 0, "the day view must not be read on the fallback")
  for (const l of BOSS_LINES) {
    const line = p.lines.find((x) => x.lineItemId === l.id)!
    assert.deepEqual(oct(p, l.id.toLowerCase()).legs, { kind: "unsplit" }, l.id)
    assert.equal("fixedCostLegs" in line, false)
  }
  assert.ok(p.notes.includes(FIXED_COST_FROM_UNSPLIT_NOTE))
  assert.equal(p.summary.grand.marginCents, 484399)
})

test("day view error, switch on: October unsplit with the note; the report still loads", { skip }, async () => {
  const { FIXED_COST_FROM_UNSPLIT_NOTE } = await import("../compose.js")
  const p = await load({ fc9: true, dayViewError: true })
  assert.equal(p.spendSource.mode, "line_month_view")
  assert.equal(dayViewCalls().length, 1)
  for (const l of BOSS_LINES) assert.deepEqual(oct(p, l.id.toLowerCase()).legs, { kind: "unsplit" }, l.id)
  assert.ok(p.notes.includes(FIXED_COST_FROM_UNSPLIT_NOTE))
  assert.equal(p.summary.grand.marginCents, 484399)
})

test("day view above the month's cost: the cost before the date is capped end to end (L4)", { skip }, async () => {
  const preDate = new Map(BOSS_LINES.map((l) => [l.id.toLowerCase(), 5000]))
  const p = await load({ fc9: true, preDate })
  for (const l of BOSS_LINES) {
    const m = oct(p, l.id.toLowerCase())
    assert.equal(m.legs?.kind, "split")
    if (m.legs?.kind !== "split") continue
    assert.equal(m.legs.before.actualCents, m.actualCents, l.id)
    assert.equal(m.legs.from.actualCents, 0, l.id)
  }
  assert.equal(p.summary.grand.marginCents, 484399)
})

test("switch off: the date is not selected, the day view is not read, base notes only", { skip }, async () => {
  const { FIXED_COST_MARGIN_NOTES } = await import("../compose.js")
  const p = await load({ fc9: false })
  assert.equal(dayViewCalls().length, 0)
  assert.doesNotMatch(pgQueries.find((q) => /fixed_cost_media, FALSE\) = TRUE/.test(q))!, /fixed_cost_from/)
  assert.deepEqual(p.notes, [...FIXED_COST_MARGIN_NOTES])
  assert.doesNotMatch(JSON.stringify(p.lines), /fixedCostFrom|"legs"|fixedCostLegs/)
  assert.equal(p.summary.grand.marginCents, 484399)
})

test("switch on, no line dated: no day view read, no FC9 notes", { skip }, async () => {
  const { FIXED_COST_MARGIN_NOTES } = await import("../compose.js")
  const p = await load({ fc9: true, fixedCostFrom: null })
  assert.equal(dayViewCalls().length, 0)
  assert.deepEqual(p.notes, [...FIXED_COST_MARGIN_NOTES])
})

// ---------------------------------------------------------------------------
// C-185 (`fixed_cost_margin_no_spend_yet`) through the loader
// ---------------------------------------------------------------------------

const month = (p: Awaited<ReturnType<typeof load>>, lid: string, m: string) =>
  p.lines.find((l) => l.lineItemId.toLowerCase() === lid)!.months.find((x) => x.month === m)!

test("C-185 off: a past billed month with no spend still counts as margin; no tag, base notes", { skip }, async () => {
  const { FIXED_COST_MARGIN_NOTES } = await import("../compose.js")
  const p = await load({ fc9: false, dropSpend: new Set(["boss010pd2|2026-09"]), now: new Date("2026-11-10T01:00:00Z") })
  const sep = month(p, "boss010pd2", "2026-09")
  assert.equal(sep.marginCents, 136000)
  assert.equal("noSpendYet" in sep, false)
  assert.deepEqual(p.notes, [...FIXED_COST_MARGIN_NOTES])
  assert.equal(p.summary.grand.marginCents, 484399 + 61902)
})

test("C-185 on: the past month is tagged, out of margin, and the note is added", { skip }, async () => {
  const { NO_SPEND_YET_NOTE } = await import("../noSpend.js")
  const p = await load({ fc9: false, noSpend: true, dropSpend: new Set(["boss010pd2|2026-09"]), now: new Date("2026-11-10T01:00:00Z") })
  const sep = month(p, "boss010pd2", "2026-09")
  assert.equal(sep.noSpendYet, "past")
  assert.equal(sep.marginCents, null)
  assert.ok(p.notes.includes(NO_SPEND_YET_NOTE))
  // 484399 less boss010pd2 September's margin (136000 - 61902 = 74098).
  assert.equal(p.summary.grand.marginCents, 484399 - 74098)
})

test("C-185 on: the current month is the Melbourne month, not the server's UTC month", { skip }, async () => {
  // 31 Oct 2026 14:30 UTC is 1 Nov 01:30 in Melbourne: October is already past.
  const p = await load({ fc9: false, noSpend: true, dropSpend: new Set(["boss010pd2|2026-10"]), now: new Date("2026-10-31T14:30:00Z") })
  assert.equal(month(p, "boss010pd2", "2026-10").noSpendYet, "past")
  // 1 Oct 2026 12:00 UTC is 1 Oct 22:00 in Melbourne: October is current, counted as today.
  const q = await load({ fc9: false, noSpend: true, dropSpend: new Set(["boss010pd2|2026-10"]), now: new Date("2026-10-01T12:00:00Z") })
  const oct = month(q, "boss010pd2", "2026-10")
  assert.equal("noSpendYet" in oct, false)
  assert.equal(oct.marginCents, 136000)
  // November is future then, and billed with spend in the fixture: not tagged (spend recorded).
  assert.equal("noSpendYet" in month(q, "boss010pd2", "2026-11"), false)
})

test("B34: the \"(to date)\" month (scope.currentMonth) is the Melbourne month, switch on or off", { skip }, async () => {
  // 31 Oct 2026 14:00 UTC is 1 Nov 01:00 AEDT.
  for (const noSpend of [false, true]) {
    const p = await load({ fc9: false, noSpend, now: new Date("2026-10-31T14:00:00Z") })
    assert.equal(p.scope.currentMonth, "2026-11", `noSpend ${noSpend}`)
    const q = await load({ fc9: false, noSpend, now: new Date("2026-10-31T12:59:59Z") })
    assert.equal(q.scope.currentMonth, "2026-10", `noSpend ${noSpend}`)
  }
  // The label and the C-185 rule read one month: October is "past" when November is "(to date)".
  const r = await load({ fc9: false, noSpend: true, dropSpend: new Set(["boss010pd2|2026-10"]), now: new Date("2026-10-31T14:00:00Z") })
  assert.equal(r.scope.currentMonth, "2026-11")
  assert.equal(month(r, "boss010pd2", "2026-10").noSpendYet, "past")
})

test("C-185 on, no month without spend: the payload equals the switch off", { skip }, async () => {
  const now = new Date("2026-11-10T01:00:00Z")
  const off = await load({ fc9: true, now })
  const on = await load({ fc9: true, noSpend: true, now })
  assert.deepEqual(on, off)
})
