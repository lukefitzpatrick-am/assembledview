/**
 * S7: one resolver for a line's tracking type, and the write side that keeps
 * the planner's choice (save payload, save route body, Postgres read back,
 * expert Apply). A line with no choice saves exactly as before.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { LINE_CHANNELS, type LineChannel } from "@/db/schema/lineChannelValues"
import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import {
  defaultTrackingType,
  isTrackingType,
  ownTrackingTypeEntry,
  resolveTrackingType,
  TRACKING_TYPES,
} from "@/lib/delivery/trackingType"
import { FEATURE_DEFINITIONS } from "@/lib/features/registry"
import { buildSavePlanLineItemsFromSnapshots } from "@/lib/mediaplan/buildPostgresSavePayload"
import { DIGITALDISPLAY_CONTAINER_CONFIG } from "@/lib/mediaplan/containerChannelConfig"
import { mergeDigiVideoStandardFromExpertWithPrevious } from "@/lib/mediaplan/expertModeSwitch"
import { plansSaveBodySchema } from "@/lib/mediaplan/plansSaveBodySchema"
import { assumeSpendForSnapshotLine } from "@/lib/spend/assumeSpendRule"

const EXPECTED_DEFAULTS: Record<LineChannel, string> = {
  television: "assumed",
  radio: "assumed",
  cinema: "assumed",
  newspaper: "assumed",
  magazines: "assumed",
  ooh: "assumed",
  prog_display: "tracked",
  prog_video: "tracked",
  prog_audio: "tracked",
  prog_bvod: "tracked",
  prog_ooh: "tracked",
  digi_display: "tracked",
  digi_video: "tracked",
  digi_audio: "tracked",
  digi_bvod: "tracked",
  social: "tracked",
  search: "tracked",
  influencers: "not_tracked",
  integrations: "not_tracked",
  production: "not_tracked",
}

describe("resolveTrackingType", () => {
  it("a line with no choice and no flags takes its channel default, for all 20 channels", () => {
    for (const channel of LINE_CHANNELS) {
      assert.equal(resolveTrackingType(channel, {}), EXPECTED_DEFAULTS[channel], channel)
    }
  })

  it("the line's own value wins, snake or camel; an unknown value is ignored", () => {
    assert.equal(resolveTrackingType("search", { tracking_type: "not_tracked" }), "not_tracked")
    assert.equal(resolveTrackingType("ooh", { trackingType: "supplier_reported" }), "supplier_reported")
    assert.equal(resolveTrackingType("ooh", { tracking_type: "Tracked" }), "assumed")
    assert.equal(resolveTrackingType("ooh", { tracking_type: "" }), "assumed")
  })

  it("a supplier file only counts where pacing reads it: programmatic and Channel Factory Digital Video", () => {
    assert.equal(resolveTrackingType("digi_video", { publisher: "Channel Factory" }), "supplier_reported")
    assert.equal(resolveTrackingType("prog_video", { publisher: " channel factory " }), "supplier_reported")
    assert.equal(resolveTrackingType("prog_ooh", { publisher: "Vistar" }), "supplier_reported")
    assert.equal(resolveTrackingType("prog_ooh", { platform: "Broadsign" }), "supplier_reported")
    assert.equal(resolveTrackingType("prog_video", { publisher: "Channel Factory", tracking_type: "tracked" }), "tracked")
  })

  it("Channel Factory on Digital Display reads CM360 today, so it is tracked (S7 Q1 A)", () => {
    assert.equal(resolveTrackingType("digi_display", { publisher: "Channel Factory" }), "tracked")
    assert.equal(resolveTrackingType("digi_audio", { publisher: "Channel Factory", no_adserving: true }), "tracked")
  })

  it("OOH booked through Broadsign or Vistar keeps the OOH default (assumed)", () => {
    assert.equal(resolveTrackingType("ooh", { publisher: "Broadsign" }), "assumed")
    assert.equal(resolveTrackingType("ooh", { publisher: "Vistar" }), "assumed")
  })

  it("a CM360 source (Quantcast, Twitch) stays tracked, with or without No Ad Serving", () => {
    assert.equal(resolveTrackingType("prog_video", { platform: "Twitch" }), "tracked")
    assert.equal(resolveTrackingType("digi_display", { publisher: "Quantcast" }), "tracked")
    assert.equal(resolveTrackingType("prog_display", { publisher: "Quantcast - Direct", no_adserving: true }), "tracked")
  })

  it("No Ad Serving on influencers, integrations and production stays not tracked", () => {
    for (const channel of ["influencers", "integrations", "production"] as const) {
      assert.equal(resolveTrackingType(channel, { noAdserving: true, publisher: "Somebody" }), "not_tracked", channel)
      assert.equal(resolveTrackingType(channel, { no_adserving: true, publisher: "Vistar" }), "not_tracked", channel)
    }
  })

  it("a digital line with No Ad Serving and no delivery source is assumed, on every key spelling", () => {
    assert.equal(resolveTrackingType("digi_display", { publisher: "News Corp", no_adserving: true }), "assumed")
    assert.equal(resolveTrackingType("digi_audio", { publisher: "LiSTNR", noAdserving: true }), "assumed")
    assert.equal(resolveTrackingType("prog_video", { publisher: "Somebody", noadserving: true }), "assumed")
    // A known source still reports it.
    assert.equal(resolveTrackingType("prog_display", { platform: "DV360", no_adserving: true }), "tracked")
    // No Ad Serving off, or a non-digital channel: the default.
    assert.equal(resolveTrackingType("digi_display", { publisher: "News Corp", no_adserving: false }), "tracked")
    assert.equal(resolveTrackingType("search", { no_adserving: true }), "tracked")
  })

  it("the No Ad Serving rule is the assumed spend rule for a digital line", () => {
    for (const channel of ["digi_display", "prog_display", "prog_ooh", "social"] as const) {
      for (const publisher of ["News Corp", "dv360", "Vistar"]) {
        for (const noAdserving of [true, false]) {
          const assumed = assumeSpendForSnapshotLine({
            buyType: "cpm",
            sourceTable: `media_plan_${channel}`,
            noAdserving,
            publisher,
            platform: null,
            deliveryMediaCents: 100,
          })
          const tracking = defaultTrackingType(channel, { publisher, noAdserving })
          assert.equal(tracking === "assumed", assumed, `${channel} ${publisher} ${noAdserving}`)
        }
      }
    }
  })

  it("isTrackingType accepts exactly the four", () => {
    assert.deepEqual([...TRACKING_TYPES], ["tracked", "supplier_reported", "assumed", "not_tracked"])
    for (const t of TRACKING_TYPES) assert.equal(isTrackingType(t), true)
    for (const bad of [undefined, null, "", "Tracked", "estimated", 1]) assert.equal(isTrackingType(bad), false)
  })

  it("ownTrackingTypeEntry adds a key only for a valid own choice", () => {
    assert.deepEqual(ownTrackingTypeEntry("tracking_type", { trackingType: "assumed" }), { tracking_type: "assumed" })
    assert.deepEqual(ownTrackingTypeEntry("trackingType", { tracking_type: "not_tracked" }), { trackingType: "not_tracked" })
    assert.deepEqual(ownTrackingTypeEntry("tracking_type", { trackingType: "" }), {})
    assert.deepEqual(ownTrackingTypeEntry("tracking_type", { trackingType: "junk" }), {})
    assert.deepEqual(ownTrackingTypeEntry("tracking_type", {}), {})
  })
})

describe("write side", () => {
  const base = {
    line_item_id: "krusty001pd1",
    buy_type: "cpm",
    platform: "DV360",
    bursts: [{ budget: "1700", buyAmount: "10", startDate: "2026-09-01", endDate: "2026-09-30" }],
  }

  it("save payload: a choice lands in attrs; no choice is byte-identical to before", () => {
    const [chosen] = buildSavePlanLineItemsFromSnapshots({ progDisplay: [{ ...base, tracking_type: "supplier_reported" }] })
    assert.equal(chosen!.attrs?.tracking_type, "supplier_reported")
    const [plain] = buildSavePlanLineItemsFromSnapshots({ progDisplay: [base] })
    assert.equal(plain!.attrs == null || !("tracking_type" in plain!.attrs), true)
    const { attrs: _a, ...chosenRest } = chosen!
    const { attrs: _b, ...plainRest } = plain!
    assert.deepEqual(chosenRest, plainRest)
  })

  it("the save route body keeps a valid tracking type and refuses an unknown one", () => {
    const line = (attrs: unknown) =>
      plansSaveBodySchema.shape.lineItems.element.safeParse({
        lineItemId: "x",
        channel: "prog_display",
        bursts: [],
        attrs,
        mediaType: "progDisplay",
        rate: 0,
        enteredAmount: 0,
      })
    const ok = line({ tracking_type: "assumed", creative: "a" })
    assert.equal(ok.success, true)
    if (ok.success) assert.deepEqual(ok.data.attrs, { tracking_type: "assumed", creative: "a" })
    assert.equal(line({ creative: "a" }).success, true)
    assert.equal(line(null).success, true)
    assert.equal(line(undefined).success, true)
    assert.equal(line({ tracking_type: "estimated" }).success, false)
    assert.equal(line({ tracking_type: null }).success, false)
    // The resolver reads both spellings, so the boundary checks both.
    assert.equal(line({ trackingType: "not_tracked" }).success, true)
    assert.equal(line({ trackingType: "estimated" }).success, false)
    assert.equal(line({ tracking_type: "assumed", trackingType: "junk" }).success, false)
  })

  it("Postgres read back puts attrs.tracking_type on the line, where the editor hydrates it", () => {
    const ctx = { versionId: 9, versionNumber: 3, mbaNumber: "KRUSTY001", mpClientName: "Krusty Krab" }
    const row = { id: 1, versionId: 9, channel: "prog_display", lineItemId: "krusty001pd1", position: 1, bursts: [], attrs: {} }
    const out = mapLineItemFromPostgres({ ...row, attrs: { tracking_type: "not_tracked" } }, ctx)
    assert.equal(out.tracking_type, "not_tracked")
    assert.equal(resolveTrackingType("prog_display", out), "not_tracked")
    assert.equal("tracking_type" in mapLineItemFromPostgres(row, ctx), false)
  })

  it("expert Apply keeps the card's choice (shared merge and Digital Display's own path)", () => {
    const prev = {
      line_item_id: "krusty001dv1",
      lineItemId: "krusty001dv1",
      trackingType: "supplier_reported",
      bursts: [{ budget: "100", buyAmount: "10", startDate: new Date(2026, 8, 1), endDate: new Date(2026, 8, 30) }],
    }
    const { trackingType: _t, ...generated } = prev
    const [merged] = mergeDigiVideoStandardFromExpertWithPrevious([generated] as never, [prev] as never)
    assert.equal((merged as { trackingType?: string }).trackingType, "supplier_reported")
    const [noChoice] = mergeDigiVideoStandardFromExpertWithPrevious([generated] as never, [generated] as never)
    assert.equal("trackingType" in (noChoice as object), false)

    const ddPrev = { ...prev, line_item_id: "krusty001dd1", lineItemId: "krusty001dd1", platform: "", site: "", buyType: "cpm", publisher: "" }
    const { trackingType: _d, ...ddGenerated } = ddPrev
    const [dd] = DIGITALDISPLAY_CONTAINER_CONFIG.mergeFromExpert!([ddGenerated], [ddPrev])
    assert.equal((dd as { trackingType?: string }).trackingType, "supplier_reported")
  })

  it("line_tracking_type is a planning switch, default off, sent to the browser", () => {
    const def = FEATURE_DEFINITIONS.find((d) => d.key === "line_tracking_type")
    assert.ok(def)
    assert.equal(def!.defaultOn, false)
    assert.equal(def!.area, "planning")
    assert.equal(def!.clientVisible, true)
    assert.equal("requires" in def!, false)
  })
})
