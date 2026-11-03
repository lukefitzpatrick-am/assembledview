/**
 * B23 FC2, FC5, FC7, FC8: the fixed cost from date on the write side.
 * Null keeps today's behaviour; the switch gates the save check.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  effectiveFixedCostFrom,
  FIXED_COST_FROM_INVALID,
  fixedCostFromForSave,
  fixedCostFromGateResult,
  fixedCostFromIssue,
  formatFixedCostFromLabel,
  isUnreadableFixedCostFrom,
  lineFlightFromBursts,
  normaliseFixedCostFrom,
  normaliseSaveLinesFixedCostFrom,
} from "@/lib/mediaplan/fixedCostFrom"
import { fixedCostFromGateForSave } from "@/lib/mediaplan/fixedCostFrom.server"
import { buildSavePlanLineItemsFromSnapshots } from "@/lib/mediaplan/buildPostgresSavePayload"
import { mergeDigiVideoStandardFromExpertWithPrevious } from "@/lib/mediaplan/expertModeSwitch"
import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import { ADJUST_BLOCKED_FIELDS } from "@/lib/ava/lineItems/applyAdjustOps"
import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"
import { fixedCostFromFieldVisible } from "@/components/media-containers/FixedCostFromField"
import { FEATURE_DEFINITIONS } from "@/lib/features/registry"

// Stored burst dates are UTC instants for a Melbourne day (1 Sep to 30 Sep 2026).
const SEP_BURST = { startDate: "2026-08-31T14:00:00.000Z", endDate: "2026-09-29T14:00:00.000Z", budget: "1700" }
const OCT_BURST = { startDate: "2026-09-30T14:00:00.000Z", endDate: "2026-10-30T13:00:00.000Z", budget: "1700" }

describe("normaliseFixedCostFrom", () => {
  it("keeps a real YYYY-MM-DD and rejects impossible days", () => {
    assert.equal(normaliseFixedCostFrom("2026-10-15"), "2026-10-15")
    assert.equal(normaliseFixedCostFrom(" 2026-10-15 "), "2026-10-15")
    assert.equal(normaliseFixedCostFrom("2026-02-30"), null)
    assert.equal(normaliseFixedCostFrom("2026-13-01"), null)
    assert.equal(normaliseFixedCostFrom("15/10/2026"), null)
    assert.equal(normaliseFixedCostFrom(""), null)
    assert.equal(normaliseFixedCostFrom(null), null)
    assert.equal(normaliseFixedCostFrom(undefined), null)
    assert.equal(normaliseFixedCostFrom(20261015), null)
  })

  it("an instant is its Melbourne day, on both daylight saving change days", () => {
    // Daylight saving starts Sun 4 Oct 2026: midnight that day is 14:00Z on 3 Oct (AEST, +10).
    assert.equal(normaliseFixedCostFrom("2026-10-03T14:00:00.000Z"), "2026-10-04")
    assert.equal(normaliseFixedCostFrom("2026-10-03T13:59:59.000Z"), "2026-10-03")
    // Daylight saving ends Sun 5 Apr 2026: midnight that day is 13:00Z on 4 Apr (AEDT, +11).
    assert.equal(normaliseFixedCostFrom("2026-04-04T13:00:00.000Z"), "2026-04-05")
    assert.equal(normaliseFixedCostFrom("2026-04-04T12:59:59.000Z"), "2026-04-04")
    assert.equal(normaliseFixedCostFrom(new Date("2026-08-31T14:00:00.000Z")), "2026-09-01")
  })

  it("isUnreadableFixedCostFrom: blank is fine, junk is not", () => {
    assert.equal(isUnreadableFixedCostFrom(""), false)
    assert.equal(isUnreadableFixedCostFrom(null), false)
    assert.equal(isUnreadableFixedCostFrom("2026-10-15"), false)
    assert.equal(isUnreadableFixedCostFrom("soon"), true)
  })
})

describe("save and read rules", () => {
  it("FC8: only a fixed-cost line keeps a date", () => {
    assert.equal(fixedCostFromForSave(true, "2026-10-15"), "2026-10-15")
    assert.equal(fixedCostFromForSave(false, "2026-10-15"), null)
    assert.equal(fixedCostFromForSave(null, "2026-10-15"), null)
    assert.equal(fixedCostFromForSave(true, ""), null)
  })

  it("effectiveFixedCostFrom: switch off or no flag is null; snake and camel keys", () => {
    const line = { fixed_cost_media: true, fixed_cost_from: "2026-10-15" }
    assert.equal(effectiveFixedCostFrom(line, true), "2026-10-15")
    assert.equal(effectiveFixedCostFrom(line, false), null)
    assert.equal(effectiveFixedCostFrom({ ...line, fixed_cost_media: false }, true), null)
    assert.equal(effectiveFixedCostFrom({ fixedCostMedia: true, fixedCostFrom: "2026-10-15" }, true), "2026-10-15")
    assert.equal(effectiveFixedCostFrom({ fixed_cost_media: true }, true), null)
    assert.equal(effectiveFixedCostFrom(null, true), null)
  })

  it("the flight is the first start to the last end, as Melbourne days", () => {
    assert.deepEqual(lineFlightFromBursts([OCT_BURST, SEP_BURST]), { start: "2026-09-01", end: "2026-10-31" })
    assert.deepEqual(lineFlightFromBursts(JSON.stringify([SEP_BURST])), { start: "2026-09-01", end: "2026-09-30" })
    assert.equal(lineFlightFromBursts([{ budget: "1" }]), null)
    assert.equal(lineFlightFromBursts("not json"), null)
  })
})

describe("fixedCostFromIssue (editor and save)", () => {
  const bursts = [SEP_BURST, OCT_BURST]

  it("blank is the whole flight: no issue", () => {
    assert.equal(fixedCostFromIssue("", bursts), null)
    assert.equal(fixedCostFromIssue(null, bursts), null)
  })

  it("mid-burst, first day, last day and a past date are fine (FC7)", () => {
    for (const d of ["2026-09-17", "2026-09-01", "2026-10-31", "2026-10-01"]) {
      assert.equal(fixedCostFromIssue(d, bursts), null, d)
    }
  })

  it("outside the flight is rejected with the flight in the message", () => {
    const before = fixedCostFromIssue("2026-08-31", bursts)
    const after = fixedCostFromIssue("2026-11-01", bursts)
    assert.match(String(before), /inside the line's flight \(1 Sep 2026 to 31 Oct 2026\)/)
    assert.match(String(after), /inside the line's flight/)
  })

  it("junk is rejected; no flight yet is not checked", () => {
    assert.equal(fixedCostFromIssue("soon", bursts), "Fixed cost from isn't a valid date.")
    assert.equal(fixedCostFromIssue("2026-10-15", []), null)
    assert.equal(formatFixedCostFromLabel("2026-01-05"), "5 Jan 2026")
  })
})

describe("save gate", () => {
  const bad = { lineItemId: "krusty001pd1", fixedCostMedia: true, fixedCostFrom: "2026-12-01", bursts: [SEP_BURST] }
  const good = { lineItemId: "krusty001pd2", fixedCostMedia: true, fixedCostFrom: "2026-09-15", bursts: [SEP_BURST] }
  const notFixed = { lineItemId: "krusty001pd3", fixedCostMedia: false, fixedCostFrom: "2030-01-01", bursts: [SEP_BURST] }

  it("switch off: never rejects", () => {
    assert.deepEqual(fixedCostFromGateResult("publish", [bad], false), { reject: false })
  })

  it("draft never rejects; publish and new_version do", () => {
    assert.deepEqual(fixedCostFromGateResult("draft", [bad], true), { reject: false })
    for (const mode of ["publish", "new_version"]) {
      const r = fixedCostFromGateResult(mode, [good, bad, notFixed], true)
      assert.equal(r.reject, true)
      if (r.reject) {
        assert.equal(r.body.code, FIXED_COST_FROM_INVALID)
        assert.deepEqual(r.body.lineItemIds, ["krusty001pd1"])
        assert.match(r.body.error, /krusty001pd1: Fixed cost from must be inside/)
      }
    }
  })

  it("good dates and lines that aren't fixed cost pass", () => {
    assert.deepEqual(fixedCostFromGateResult("publish", [good, notFixed], true), { reject: false })
  })

  it("server wrapper: reads the switch; a failed read is off; drafts skip the read", async () => {
    let reads = 0
    const on = { isOn: async () => (reads++, true) }
    assert.equal((await fixedCostFromGateForSave("publish", [bad], on)).reject, true)
    assert.equal((await fixedCostFromGateForSave("draft", [bad], on)).reject, false)
    assert.equal(reads, 1)
    const broken = {
      isOn: async () => {
        throw new Error("db down")
      },
    }
    assert.equal((await fixedCostFromGateForSave("publish", [bad], broken)).reject, false)
  })
})

describe("normaliseSaveLinesFixedCostFrom", () => {
  it("lines with no key come back as the same objects (no change)", () => {
    const lines = [{ lineItemId: "a", fixedCostMedia: true }, { lineItemId: "b", fixedCostMedia: false }]
    const out = normaliseSaveLinesFixedCostFrom(lines)
    assert.equal(out[0], lines[0])
    assert.equal(out[1], lines[1])
  })

  it("keeps a valid date on a fixed-cost line, drops it otherwise", () => {
    const out = normaliseSaveLinesFixedCostFrom([
      { lineItemId: "a", fixedCostMedia: true, fixedCostFrom: "2026-10-15" },
      { lineItemId: "b", fixedCostMedia: false, fixedCostFrom: "2026-10-15" },
      { lineItemId: "c", fixedCostMedia: true, fixedCostFrom: "" },
      { lineItemId: "d", fixedCostMedia: true, fixedCostFrom: null },
    ])
    assert.equal(out[0]!.fixedCostFrom, "2026-10-15")
    for (const line of out.slice(1)) assert.equal("fixedCostFrom" in line, false, line.lineItemId)
  })
})

describe("save payload (both editors)", () => {
  const base = {
    line_item_id: "krusty001pd1",
    buy_type: "cpm",
    bursts: [{ ...SEP_BURST, buyAmount: "10" }],
  }

  it("no date: no key, and no fixed_cost_from in attrs (byte-identical)", () => {
    const [line] = buildSavePlanLineItemsFromSnapshots({ progDisplay: [{ ...base, fixed_cost_media: true }] })
    assert.equal("fixedCostFrom" in line!, false)
    const [withBlank] = buildSavePlanLineItemsFromSnapshots({
      progDisplay: [{ ...base, fixed_cost_media: true, fixed_cost_from: "" }],
    })
    assert.equal("fixedCostFrom" in withBlank!, false)
    assert.equal(withBlank!.attrs == null || !("fixed_cost_from" in withBlank!.attrs), true)
    assert.deepEqual(withBlank, line)
  })

  it("a date on a fixed-cost line is sent as fixedCostFrom; on a normal line it is dropped", () => {
    const [fixed] = buildSavePlanLineItemsFromSnapshots({
      progDisplay: [{ ...base, fixed_cost_media: true, fixed_cost_from: "2026-09-15" }],
    })
    assert.equal(fixed!.fixedCostFrom, "2026-09-15")
    const [normal] = buildSavePlanLineItemsFromSnapshots({
      progDisplay: [{ ...base, fixed_cost_media: false, fixedCostFrom: "2026-09-15" }],
    })
    assert.equal("fixedCostFrom" in normal!, false)
    assert.equal(normal!.attrs == null || !("fixedCostFrom" in normal!.attrs), true)
  })

  it("the save body schema keeps fixedCostFrom", () => {
    const parsed = plansSaveBodySchema.shape.lineItems.element.safeParse({
      lineItemId: "x",
      channel: "prog_display",
      fixedCostMedia: true,
      fixedCostFrom: "2026-09-15",
      bursts: [],
      mediaType: "progDisplay",
      rate: 0,
      enteredAmount: 0,
    })
    assert.equal(parsed.success, true)
    if (parsed.success) assert.equal(parsed.data.fixedCostFrom, "2026-09-15")
  })
})

describe("expert Apply keeps the card's date (attachBurstPreserve)", () => {
  const prev = {
    line_item_id: "krusty001dv1",
    lineItemId: "krusty001dv1",
    fixedCostMedia: true,
    fixedCostFrom: "2026-09-15",
    bursts: [{ budget: "100", buyAmount: "10", startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) }],
  }
  const generated = { ...prev, fixedCostFrom: undefined as unknown as string }
  delete (generated as Record<string, unknown>).fixedCostFrom

  it("still fixed cost: the date is kept", () => {
    const [merged] = mergeDigiVideoStandardFromExpertWithPrevious([generated] as never, [prev] as never)
    assert.equal((merged as { fixedCostFrom?: string }).fixedCostFrom, "2026-09-15")
  })

  it("grid unticked Fixed Cost Media: the date is cleared (FC8)", () => {
    const [merged] = mergeDigiVideoStandardFromExpertWithPrevious(
      [{ ...generated, fixedCostMedia: false }] as never,
      [prev] as never,
    )
    assert.equal((merged as { fixedCostFrom?: string }).fixedCostFrom, "")
  })

  it("a card with no date key: no key added", () => {
    const { fixedCostFrom: _x, ...noKey } = prev
    const [merged] = mergeDigiVideoStandardFromExpertWithPrevious([generated] as never, [noKey] as never)
    assert.equal("fixedCostFrom" in (merged as object), false)
  })
})

describe("read back from Postgres", () => {
  const ctx = { versionId: 9, versionNumber: 3, mbaNumber: "KRUSTY001", mpClientName: "Krusty Krab" }
  const row = {
    id: 1,
    versionId: 9,
    channel: "prog_display",
    lineItemId: "krusty001pd1",
    position: 1,
    fixedCostMedia: true,
    bursts: [],
    attrs: {},
  }

  it("null date: no key, as before", () => {
    const out = mapLineItemFromPostgres({ ...row, fixedCostFrom: null }, ctx)
    assert.equal("fixed_cost_from" in out, false)
    assert.deepEqual(out, mapLineItemFromPostgres(row, ctx))
  })

  it("a date comes back as fixed_cost_from", () => {
    const out = mapLineItemFromPostgres({ ...row, fixedCostFrom: "2026-09-15" }, ctx)
    assert.equal(out.fixed_cost_from, "2026-09-15")
  })
})

describe("other writers and the switch", () => {
  it("Ava's adjust ops can't touch the date", () => {
    assert.ok((ADJUST_BLOCKED_FIELDS as readonly string[]).includes("fixed_cost_from"))
    assert.ok((ADJUST_BLOCKED_FIELDS as readonly string[]).includes("fixedCostFrom"))
  })

  it("the card field shows only with the switch on and the box ticked", () => {
    assert.equal(fixedCostFromFieldVisible(true, true), true)
    assert.equal(fixedCostFromFieldVisible(false, true), false)
    assert.equal(fixedCostFromFieldVisible(true, false), false)
  })

  it("fixed_cost_from_date is a planning switch, default off, sent to the browser", () => {
    const def = FEATURE_DEFINITIONS.find((d) => d.key === "fixed_cost_from_date")
    assert.ok(def)
    assert.equal(def!.defaultOn, false)
    assert.equal(def!.area, "planning")
    assert.equal(def!.clientVisible, true)
  })
})
