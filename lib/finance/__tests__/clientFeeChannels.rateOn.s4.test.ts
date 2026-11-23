/**
 * S4: a client fee rate on a date (clientFeeStateFromRow with dated changes,
 * through clientFeeRateOn) and the plan pages' call (planClientFeeState).
 *
 * - Effective-date boundary: the day before keeps the old rate, the day on
 *   and after take the new one; the latest change on or before the date wins.
 * - Melbourne month edge: 30 Nov 13:30 UTC is 1 Dec in Melbourne, so a change
 *   from 1 Dec is in force on that instant's Melbourne day.
 * - No changes: exactly the column rule (B22).
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import test from "node:test"

import { planClientFeeState } from "@/app/mediaplans/_form/clientFees"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { clientFeeStateFromRow, type ClientFeeRateChange } from "@/lib/finance/clientFeeChannels"

const ROW = { feesearch: 10, feesocial: "15", feecontentcreator: 5, feeooh: 8, feeinfluencers: null }
const CHANGES: ClientFeeRateChange[] = [
  { field: "feesearch", ratePct: 12, effectiveFrom: "2026-12-01" },
  { field: "feesearch", ratePct: 14, effectiveFrom: "2027-03-01" },
  { field: "feecontentcreator", ratePct: 7, effectiveFrom: "2026-12-01" },
  { field: "feeooh", ratePct: 0, effectiveFrom: "2026-12-01" },
]
const row = (changes: unknown = CHANGES) => ({ ...ROW, fee_rate_changes: changes })
const on = (onDate: string, opts: { channelFees?: boolean; changes?: unknown } = {}) =>
  clientFeeStateFromRow(row(opts.changes), { channelFees: opts.channelFees ?? true, onDate })

test("the day before the effective date keeps the column rate", () => {
  assert.equal(on("2026-11-30").feesearch, 10)
})

test("on and after the effective date the change is in force", () => {
  assert.equal(on("2026-12-01").feesearch, 12)
  assert.equal(on("2026-12-02").feesearch, 12)
  assert.equal(on("2027-02-28").feesearch, 12)
})

test("the latest change on or before the date wins, whatever the list order", () => {
  assert.equal(on("2027-03-01").feesearch, 14)
  assert.equal(on("2027-03-01", { changes: [...CHANGES].reverse() }).feesearch, 14)
})

test("a field with no change reads its column", () => {
  assert.equal(on("2027-06-01").feesocial, 15)
})

test("an explicit 0% change is a real 0, not the column", () => {
  assert.equal(on("2026-12-01").feeooh, 0)
  assert.equal(on("2026-11-30").feeooh, 8)
})

test("Influencers with no rate of its own inherits Content Creator on the same date", () => {
  assert.equal(on("2026-11-30").feeinfluencers, 5)
  assert.equal(on("2026-12-01").feeinfluencers, 7)
})

test("switch channel_client_fees off: a change on one of the 12 from 0113 is ignored", () => {
  assert.equal(on("2026-12-01", { channelFees: false }).feeooh, undefined)
  assert.equal(on("2026-12-01", { channelFees: false }).feesearch, 12)
})

test("Melbourne month edge: a UTC instant on 30 Nov that is 1 Dec in Melbourne takes the 1 Dec rate", () => {
  const melbourneDay = getMelbourneTodayISO(new Date("2026-11-30T13:30:00Z"))
  assert.equal(melbourneDay, "2026-12-01")
  assert.equal(on(melbourneDay).feesearch, 12)
  assert.equal(on(getMelbourneTodayISO(new Date("2026-11-30T12:59:00Z"))).feesearch, 10)
})

test("no changes, or none well formed: exactly the column rule", () => {
  const columns = clientFeeStateFromRow(ROW, { channelFees: true })
  assert.deepEqual(on("2026-12-01", { changes: [] }), columns)
  assert.deepEqual(on("2026-12-01", { changes: "junk" }), columns)
  const bad = [
    { field: "feenope", ratePct: 1, effectiveFrom: "2026-01-01" },
    { field: "feesearch", ratePct: "12", effectiveFrom: "2026-01-01" },
    { field: "feesearch", ratePct: 12, effectiveFrom: "1 Dec 2026" },
    null,
  ]
  assert.deepEqual(on("2026-12-01", { changes: bad }), columns)
})

test("a date that isn't YYYY-MM-DD is refused, never guessed", () => {
  assert.throws(() => on("01/12/2026"), /YYYY-MM-DD/)
})

test("planClientFeeState: the plan start (local midnight Date) is the civil date; no valid start is today", () => {
  assert.equal(planClientFeeState(row(), new Date(2026, 10, 30)).feesearch, 10)
  assert.equal(planClientFeeState(row(), new Date(2026, 11, 1)).feesearch, 12)
  const today = getMelbourneTodayISO()
  const expected = clientFeeStateFromRow(row(), { channelFees: false, onDate: today }).feesearch
  assert.equal(planClientFeeState(row(), new Date("x")).feesearch, expected)
  assert.equal(planClientFeeState(row(), undefined).feesearch, expected)
})

test("planClientFeeState: a start before year 1000 (not YYYY-MM-DD) is no start, so today, never a throw", () => {
  const early = new Date(2026, 0, 1)
  early.setFullYear(999)
  const today = getMelbourneTodayISO()
  const expected = clientFeeStateFromRow(row(), { channelFees: false, onDate: today }).feesearch
  assert.equal(planClientFeeState(row(), early).feesearch, expected)
})
