/**
 * SM-13 — compact descriptor widths + rowLabelKey on every channel.
 * Expanded mode must stay byte-identical to expertGridDescriptorColWidths.
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridDescriptorColWidthsForMode.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"

import { expertGridDescriptorStickySpanWidthPx } from "@/components/media-containers/expertGridSticky"
import { EXPERT_GRID_BODY_ROW_HEIGHT_PX } from "@/lib/mediaplan/oohExpertVirtualization"
import {
  BVOD_EXPERT_CHANNEL_CONFIG,
  CINEMA_EXPERT_CHANNEL_CONFIG,
  COMPACT_ROW_LABEL_WIDTH_PX,
  DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG,
  DIGIAUDIO_EXPERT_CHANNEL_CONFIG,
  DIGIVIDEO_EXPERT_CHANNEL_CONFIG,
  INFLUENCERS_EXPERT_CHANNEL_CONFIG,
  INTEGRATION_EXPERT_CHANNEL_CONFIG,
  MAGAZINES_EXPERT_CHANNEL_CONFIG,
  NEWSPAPER_EXPERT_CHANNEL_CONFIG,
  OOH_EXPERT_CHANNEL_CONFIG,
  PRODUCTION_EXPERT_CHANNEL_CONFIG,
  PROGAUDIO_EXPERT_CHANNEL_CONFIG,
  PROGBVOD_EXPERT_CHANNEL_CONFIG,
  PROGDISPLAY_EXPERT_CHANNEL_CONFIG,
  PROGOOH_EXPERT_CHANNEL_CONFIG,
  PROGVIDEO_EXPERT_CHANNEL_CONFIG,
  RADIO_EXPERT_CHANNEL_CONFIG,
  SEARCH_EXPERT_CHANNEL_CONFIG,
  SOCIALMEDIA_EXPERT_CHANNEL_CONFIG,
  TELEVISION_EXPERT_CHANNEL_CONFIG,
  expertGridDescriptorColWidths,
  expertGridDescriptorColWidthsForMode,
  expertGridDescriptorKeys,
  expertGridDescriptorWidthKeys,
  getExpertGridSurfaceFields,
  type ExpertGridChannelConfig,
  type ExpertScheduleRowCommon,
} from "@/lib/mediaplan/expertGridChannelConfig"

const ALL_CONFIGS: ReadonlyArray<{
  label: string
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
}> = [
  { label: "Search", config: SEARCH_EXPERT_CHANNEL_CONFIG },
  { label: "Prog Video", config: PROGVIDEO_EXPERT_CHANNEL_CONFIG },
  { label: "Prog Display", config: PROGDISPLAY_EXPERT_CHANNEL_CONFIG },
  { label: "Prog Audio", config: PROGAUDIO_EXPERT_CHANNEL_CONFIG },
  { label: "Prog BVOD", config: PROGBVOD_EXPERT_CHANNEL_CONFIG },
  { label: "Prog OOH", config: PROGOOH_EXPERT_CHANNEL_CONFIG },
  { label: "Social Media", config: SOCIALMEDIA_EXPERT_CHANNEL_CONFIG },
  { label: "OOH", config: OOH_EXPERT_CHANNEL_CONFIG },
  { label: "Digital Display", config: DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG },
  { label: "Digital Video", config: DIGIVIDEO_EXPERT_CHANNEL_CONFIG },
  { label: "Digital Audio", config: DIGIAUDIO_EXPERT_CHANNEL_CONFIG },
  { label: "BVOD", config: BVOD_EXPERT_CHANNEL_CONFIG },
  { label: "Television", config: TELEVISION_EXPERT_CHANNEL_CONFIG },
  { label: "Radio", config: RADIO_EXPERT_CHANNEL_CONFIG },
  { label: "Cinema", config: CINEMA_EXPERT_CHANNEL_CONFIG },
  { label: "Newspaper", config: NEWSPAPER_EXPERT_CHANNEL_CONFIG },
  { label: "Magazines", config: MAGAZINES_EXPERT_CHANNEL_CONFIG },
  { label: "Influencers", config: INFLUENCERS_EXPERT_CHANNEL_CONFIG },
  { label: "Integration", config: INTEGRATION_EXPERT_CHANNEL_CONFIG },
  { label: "Production", config: PRODUCTION_EXPERT_CHANNEL_CONFIG },
]

const COMPACT_KEEP = new Set(["netMedia", "totalCost", "sumQty"])

function assertCompactShape(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  showBillingCols: boolean
) {
  const expanded = expertGridDescriptorColWidths(config, showBillingCols)
  const compact = expertGridDescriptorColWidthsForMode(
    config,
    showBillingCols,
    "compact"
  )
  const keys = expertGridDescriptorWidthKeys(config, showBillingCols)
  assert.equal(compact.length, expanded.length)
  assert.equal(keys.length, expanded.length)
  for (let i = 0; i < compact.length; i++) {
    const key = keys[i]!
    if (key === config.rowLabelKey) {
      assert.equal(compact[i], COMPACT_ROW_LABEL_WIDTH_PX, key)
    } else if (COMPACT_KEEP.has(key)) {
      assert.equal(compact[i], expanded[i], key)
      assert.ok((compact[i] ?? 0) > 0, `${key} should stay non-zero`)
    } else {
      assert.equal(compact[i], 0, key)
    }
  }
}

test("OOH expanded widths are byte-identical to today (billing off and on)", () => {
  for (const billing of [false, true]) {
    const today = expertGridDescriptorColWidths(OOH_EXPERT_CHANNEL_CONFIG, billing)
    const expanded = expertGridDescriptorColWidthsForMode(
      OOH_EXPERT_CHANNEL_CONFIG,
      billing,
      "expanded"
    )
    assert.deepEqual(expanded, today)
  }
})

test("OOH compact has same length; only rowLabelKey / net media / Σ non-zero", () => {
  assertCompactShape(OOH_EXPERT_CHANNEL_CONFIG, false)
  assertCompactShape(OOH_EXPERT_CHANNEL_CONFIG, true)
})

test("OOH compact rowLabelKey is placement at 140px", () => {
  assert.equal(OOH_EXPERT_CHANNEL_CONFIG.rowLabelKey, "placement")
  const keys = expertGridDescriptorWidthKeys(OOH_EXPERT_CHANNEL_CONFIG, false)
  const compact = expertGridDescriptorColWidthsForMode(
    OOH_EXPERT_CHANNEL_CONFIG,
    false,
    "compact"
  )
  const i = keys.indexOf("placement")
  assert.ok(i >= 0)
  assert.equal(compact[i], 140)
  assert.equal(compact[keys.indexOf("actions")], 0)
  assert.equal(compact[keys.indexOf("netMedia")], 100)
  assert.equal(compact[keys.indexOf("sumQty")], 68)
})

test("SF-7 span-width invariant holds in both modes (OOH billing on and off)", () => {
  for (const billing of [false, true]) {
    const keys = expertGridDescriptorKeys(OOH_EXPERT_CHANNEL_CONFIG, billing)
    for (const mode of ["expanded", "compact"] as const) {
      const widths = expertGridDescriptorColWidthsForMode(
        OOH_EXPERT_CHANNEL_CONFIG,
        billing,
        mode
      )
      const span = expertGridDescriptorStickySpanWidthPx(widths, keys.length)
      const expected = widths.slice(0, keys.length).reduce((s, w) => s + w, 0)
      assert.equal(span, expected, `${mode} billing=${billing}`)
    }
  }
})

test("every channel config has a rowLabelKey in its grid surface fields", () => {
  assert.equal(ALL_CONFIGS.length, 20)
  for (const { label, config } of ALL_CONFIGS) {
    const surfaceKeys = new Set(
      getExpertGridSurfaceFields(config).map((c) => c.key)
    )
    assert.ok(
      typeof config.rowLabelKey === "string" && config.rowLabelKey.length > 0,
      `${label} missing rowLabelKey`
    )
    assert.ok(
      surfaceKeys.has(config.rowLabelKey),
      `${label} rowLabelKey "${config.rowLabelKey}" is not a grid surface field`
    )
  }
})

test("every channel bodyRowHeightPx is the shared 41 unless it states why", () => {
  assert.equal(ALL_CONFIGS.length, 20)
  for (const { label, config } of ALL_CONFIGS) {
    const h = config.bodyRowHeightPx
    if (h == null || h === EXPERT_GRID_BODY_ROW_HEIGHT_PX) continue
    const reason = config.bodyRowHeightPxReason?.trim() ?? ""
    assert.ok(
      reason.length > 0,
      `${label} bodyRowHeightPx=${h} (shared is ${EXPERT_GRID_BODY_ROW_HEIGHT_PX}) needs bodyRowHeightPxReason`
    )
  }
})
