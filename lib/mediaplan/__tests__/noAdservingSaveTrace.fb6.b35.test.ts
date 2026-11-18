/**
 * B35 (FB-6): the "No ad serving" box, traced through load and save.
 *
 * `buildSavePlanLineItemsFromSnapshots` reads `raw.no_adserving ?? raw.noAdserving`,
 * not the lower-case `noadserving` most form lines use. This pins why that
 * is safe: the save snapshot is never a form line. Every container builds it
 * with `mapFormToApi(fieldMap, formLine)`, which writes snake `no_adserving`
 * from the form key (`noadserving`, or `noAdserving` on OOH and Integration).
 * Load is the reverse (`mapLineItemFromPostgres` then `mapHydrationToForm`,
 * which reads snake first). A ticked box stays ticked and an unticked one
 * stays unticked, through the card and through the expert grid. Tests only.
 */
import "@/lib/testing/bothZones"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { mapLineItemFromPostgres } from "@/lib/data/planShapes"
import {
  BVOD_CONTAINER_CONFIG,
  DIGITALAUDIO_CONTAINER_CONFIG,
  DIGITALDISPLAY_CONTAINER_CONFIG,
  DIGITALVIDEO_CONTAINER_CONFIG,
  INTEGRATION_CONTAINER_CONFIG,
  OOH_CONTAINER_CONFIG,
  PROGVIDEO_CONTAINER_CONFIG,
  mapFormToApi,
  mapHydrationToForm,
  type ContainerChannelConfig,
} from "@/lib/mediaplan/containerChannelConfig"
import { buildSavePlanLineItemsFromSnapshots } from "@/lib/mediaplan/buildPostgresSavePayload"
import {
  mapDigitalDisplayExpertRowsToStandardLineItems,
  mapStandardDigiDisplayLineItemsToExpertRows,
} from "@/lib/mediaplan/expertChannelMappings"
import { mergeDigiDisplayStandardFromExpertWithPrevious } from "@/lib/mediaplan/expertModeSwitch"
import { buildWeeklyGanttColumnsFromCampaign } from "@/lib/utils/weeklyGanttColumns"

type Case = { name: string; config: ContainerChannelConfig; channel: string; snapshotKey: string; id: string; formKey: string }

const CASES: Case[] = [
  { name: "Digital Display", config: DIGITALDISPLAY_CONTAINER_CONFIG, channel: "digi_display", snapshotKey: "digiDisplay", id: "TEST001DD1", formKey: "noadserving" },
  { name: "Digital Video", config: DIGITALVIDEO_CONTAINER_CONFIG, channel: "digi_video", snapshotKey: "digiVideo", id: "TEST001DV1", formKey: "noadserving" },
  { name: "Digital Audio", config: DIGITALAUDIO_CONTAINER_CONFIG, channel: "digi_audio", snapshotKey: "digiAudio", id: "TEST001DA1", formKey: "noadserving" },
  { name: "BVOD", config: BVOD_CONTAINER_CONFIG, channel: "digi_bvod", snapshotKey: "bvod", id: "TEST001BV1", formKey: "noadserving" },
  { name: "Prog Video", config: PROGVIDEO_CONTAINER_CONFIG, channel: "prog_video", snapshotKey: "progVideo", id: "TEST001PV1", formKey: "noadserving" },
  // C-36: OOH and Integration keep camel `noAdserving` on the form.
  { name: "OOH", config: OOH_CONTAINER_CONFIG, channel: "ooh", snapshotKey: "ooh", id: "TEST001OH1", formKey: "noAdserving" },
  { name: "Integration", config: INTEGRATION_CONTAINER_CONFIG, channel: "integrations", snapshotKey: "integration", id: "TEST001IN1", formKey: "noAdserving" },
]

const ctx = { versionId: 1, versionNumber: 1, mbaNumber: "TEST001", mpClientName: "Test" }

/** Postgres row (as Drizzle returns it) -> API line -> form line -> save snapshot -> save payload. */
function roundTrip(c: Case, column: boolean | null): boolean | null | undefined {
  const api = mapLineItemFromPostgres(
    { id: 1, channel: c.channel, lineItemId: c.id, position: 1, noAdserving: column, bursts: [], attrs: {} },
    ctx,
  )
  const formLine = mapHydrationToForm(c.config.fieldMap, api)
  // The container save transform: `...mapFormToApi(fieldMap, formLine)` plus id and bursts.
  const snapshot = { ...mapFormToApi(c.config.fieldMap, formLine), line_item_id: c.id, bursts: [] }
  const [saved] = buildSavePlanLineItemsFromSnapshots({ [c.snapshotKey]: [snapshot] })
  return saved!.noAdserving
}

for (const c of CASES) {
  test(`${c.name}: a ticked box loads ticked and saves ticked; unticked stays unticked`, () => {
    const api = mapLineItemFromPostgres(
      { id: 1, channel: c.channel, lineItemId: c.id, position: 1, noAdserving: true, bursts: [], attrs: {} },
      ctx,
    )
    assert.equal(api.no_adserving, true)
    assert.equal(mapHydrationToForm(c.config.fieldMap, api)[c.formKey], true, "form key")
    assert.equal(roundTrip(c, true), true)
    assert.equal(roundTrip(c, false), false)
    // An old row with the column empty saves as false (no box was ticked).
    assert.equal(roundTrip(c, null), false)
  })
}

test("the save reads snake (and OOH camel) only; a lower-case key alone is not read, and no snapshot carries one", () => {
  const [lower] = buildSavePlanLineItemsFromSnapshots({ digiDisplay: [{ line_item_id: "TEST001DD1", bursts: [], noadserving: true }] })
  assert.equal(lower!.noAdserving, false)
  const [snake] = buildSavePlanLineItemsFromSnapshots({ digiDisplay: [{ line_item_id: "TEST001DD1", bursts: [], no_adserving: true }] })
  assert.equal(snake!.noAdserving, true)
  const [camel] = buildSavePlanLineItemsFromSnapshots({ ooh: [{ line_item_id: "TEST001OH1", bursts: [], noAdserving: true }] })
  assert.equal(camel!.noAdserving, true)
  // mapFormToApi never emits the lower-case key, for any channel that has the field.
  for (const c of CASES) {
    const out = mapFormToApi(c.config.fieldMap, { [c.formKey]: true })
    assert.equal(out.no_adserving, true, c.name)
    assert.equal("noadserving" in out, false, c.name)
  }
})

test("every container save transform spreads mapFormToApi of its own config", () => {
  const files: Array<[string, RegExp]> = [
    ["components/media-containers/DigitalDisplayContainer.tsx", /\.\.\.mapFormToApi\(DIGITALDISPLAY_CONTAINER_CONFIG\.fieldMap, lineItem\)/],
    ["components/media-containers/BVODContainer.tsx", /\.\.\.mapFormToApi\(BVOD_CONTAINER_CONFIG\.fieldMap, lineItem\)/],
    ["components/media-containers/OOHContainer.tsx", /\.\.\.mapFormToApi\(OOH_CONTAINER_CONFIG\.fieldMap, lineItem\)/],
    // Programmatic, Search, Social, Influencers, Integration, Digital Video and Digital Audio share the hook.
    ["lib/mediaplan/useMediaChannelContainer.ts", /\.\.\.mapFormToApi\(config\.fieldMap, lineItem\)/],
  ]
  for (const [file, re] of files) {
    const src = readFileSync(path.join(process.cwd(), file), "utf8")
    assert.match(src, re, file)
    assert.doesNotMatch(src, /\bnoadserving:\s*(true|false)\b/, `${file} must not hard-code the box`)
    // B35fix (B35 review N2): nothing after the spread sets the box again.
    const spread = re.exec(src)!
    const after = src.slice(spread.index + spread[0].length)
    const literal = after.slice(0, after.search(/\n\s*\}\)?;?\s*\n/))
    assert.ok(literal.includes("bursts:"), `${file}: read the transform's object literal`)
    assert.doesNotMatch(literal, /\b(no_adserving|noAdserving|noadserving)\b/, `${file} overrides the box after the spread`)
  }
})

test("expert grid round trip keeps the box (Digital Display): ticked stays ticked, unticked stays unticked", () => {
  const CS = new Date(2026, 0, 4)
  const CE = new Date(2026, 0, 31)
  const cols = buildWeeklyGanttColumnsFromCampaign(CS, CE)
  for (const ticked of [true, false]) {
    const formLine = {
      platform: "CM360",
      site: "news.com.au",
      buyType: "cpm",
      publisher: "News Corp",
      creativeTargeting: "",
      creative: "",
      buyingDemo: "",
      market: "",
      fixedCostMedia: false,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      noadserving: ticked,
      lineItemId: "TEST001DD1",
      line_item_id: "TEST001DD1",
      line_item: 1,
      lineItem: 1,
      placement: "",
      size: "",
      targetingAttribute: "",
      bursts: [{ budget: "1000", buyAmount: "10", startDate: new Date(2026, 0, 12), endDate: new Date(2026, 0, 18), calculatedValue: 100000, fee: 0 }],
    }
    const rows = mapStandardDigiDisplayLineItemsToExpertRows([formLine], cols, CS, CE)
    assert.equal(rows[0]!.noadserving, ticked, "grid column seeded")
    const generated = mapDigitalDisplayExpertRowsToStandardLineItems(rows, cols, CS, CE, {})
    const [merged] = mergeDigiDisplayStandardFromExpertWithPrevious(generated, [formLine as never])
    assert.equal(merged!.noadserving, ticked, "Apply keeps it")
    const snapshot = { ...mapFormToApi(DIGITALDISPLAY_CONTAINER_CONFIG.fieldMap, merged as never), line_item_id: "TEST001DD1", bursts: [] }
    assert.equal(buildSavePlanLineItemsFromSnapshots({ digiDisplay: [snapshot] })[0]!.noAdserving, ticked, "saved")
  }
})
