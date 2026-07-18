/**
 * Per-channel interactive parity for the config-driven ExpertGrid shell.
 *
 * Exercises (without mounting React):
 *   - header labels == ExpertCard FormLabels (shared-surface keys)
 *   - paste into a text column (+ buyType via normalizePaste)
 *   - fill-handle drag + double-click (all-below)
 *   - buy-type switch
 *   - keyboard-nav cell ids + Enter/Arrow row deltas
 *   - DigiVideo Placement / Ad Size; TV TARPs / Creative Length
 *
 * Run: npx tsx --test lib/mediaplan/__tests__/expertGridInteractiveParity.test.ts
 */
import assert from "node:assert/strict"
import test from "node:test"

import { getExpertCardRenderedFields } from "@/components/media-containers/ExpertCard"
import {
  BVOD_EXPERT_CHANNEL_CONFIG,
  CINEMA_EXPERT_CHANNEL_CONFIG,
  createEmptyBvodExpertRow,
  createEmptyCinemaExpertRow,
  createEmptyDigitalAudioExpertRow,
  createEmptyDigitalDisplayExpertRow,
  createEmptyDigiVideoExpertRow,
  createEmptyInfluencersExpertRow,
  createEmptyIntegrationExpertRow,
  createEmptyMagazinesExpertRow,
  createEmptyNewspaperExpertRow,
  createEmptyOohExpertRow,
  createEmptyProductionExpertRow,
  createEmptyProgAudioExpertRow,
  createEmptyProgBvodExpertRow,
  createEmptyProgDisplayExpertRow,
  createEmptyProgOohExpertRow,
  createEmptyProgVideoExpertRow,
  createEmptyRadioExpertRow,
  createEmptySearchExpertRow,
  createEmptySocialMediaExpertRow,
  createEmptyTelevisionExpertRow,
  DIGIAUDIO_EXPERT_CHANNEL_CONFIG,
  DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG,
  DIGIVIDEO_EXPERT_CHANNEL_CONFIG,
  expertGridBodyDescriptorColumns,
  expertGridDescriptorHeadLabels,
  getExpertCardSurfaceFields,
  getExpertGridSurfaceFields,
  getRowString,
  INFLUENCERS_EXPERT_CHANNEL_CONFIG,
  INTEGRATION_EXPERT_CHANNEL_CONFIG,
  MAGAZINES_EXPERT_CHANNEL_CONFIG,
  NEWSPAPER_EXPERT_CHANNEL_CONFIG,
  OOH_EXPERT_CHANNEL_CONFIG,
  PROGAUDIO_EXPERT_CHANNEL_CONFIG,
  PROGBVOD_EXPERT_CHANNEL_CONFIG,
  PROGDISPLAY_EXPERT_CHANNEL_CONFIG,
  PROGOOH_EXPERT_CHANNEL_CONFIG,
  PROGVIDEO_EXPERT_CHANNEL_CONFIG,
  PRODUCTION_EXPERT_CHANNEL_CONFIG,
  RADIO_EXPERT_CHANNEL_CONFIG,
  SEARCH_EXPERT_CHANNEL_CONFIG,
  SOCIALMEDIA_EXPERT_CHANNEL_CONFIG,
  TELEVISION_EXPERT_CHANNEL_CONFIG,
  type ExpertDescriptorColumn,
  type ExpertGridChannelConfig,
  type ExpertScheduleRowCommon,
} from "@/lib/mediaplan/expertGridChannelConfig"
import { applyExpertFillDown } from "@/lib/mediaplan/expertGridFill"
import { expertGridCellId } from "@/lib/mediaplan/expertGridKeyboardNav"

type ChannelEntry = {
  label: string
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
  createEmpty: (
    id: string,
    campaignStartDate: Date,
    campaignEndDate: Date,
    weekKeys: string[]
  ) => ExpertScheduleRowCommon
}

const CS = new Date(2026, 0, 1)
const CE = new Date(2026, 0, 31)
const WEEK_KEYS = ["2026-01-05", "2026-01-12"]

const CHANNELS: ChannelEntry[] = [
  {
    label: "Search",
    config: SEARCH_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptySearchExpertRow,
  },
  {
    label: "ProgVideo",
    config: PROGVIDEO_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyProgVideoExpertRow,
  },
  {
    label: "ProgDisplay",
    config: PROGDISPLAY_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyProgDisplayExpertRow,
  },
  {
    label: "ProgAudio",
    config: PROGAUDIO_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyProgAudioExpertRow,
  },
  {
    label: "ProgBvod",
    config: PROGBVOD_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyProgBvodExpertRow,
  },
  {
    label: "ProgOoh",
    config: PROGOOH_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyProgOohExpertRow,
  },
  {
    label: "SocialMedia",
    config: SOCIALMEDIA_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptySocialMediaExpertRow,
  },
  {
    label: "OOH",
    config: OOH_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyOohExpertRow,
  },
  {
    label: "DigitalDisplay",
    config: DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyDigitalDisplayExpertRow,
  },
  {
    label: "DigiVideo",
    config: DIGIVIDEO_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyDigiVideoExpertRow,
  },
  {
    label: "DigitalAudio",
    config: DIGIAUDIO_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyDigitalAudioExpertRow,
  },
  {
    label: "BVOD",
    config: BVOD_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyBvodExpertRow,
  },
  {
    label: "Television",
    config: TELEVISION_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyTelevisionExpertRow,
  },
  {
    label: "Radio",
    config: RADIO_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyRadioExpertRow,
  },
  {
    label: "Cinema",
    config: CINEMA_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyCinemaExpertRow,
  },
  {
    label: "Newspaper",
    config: NEWSPAPER_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyNewspaperExpertRow,
  },
  {
    label: "Magazines",
    config: MAGAZINES_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyMagazinesExpertRow,
  },
  {
    label: "Influencers",
    config: INFLUENCERS_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyInfluencersExpertRow,
  },
  {
    label: "Integration",
    config: INTEGRATION_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyIntegrationExpertRow,
  },
  {
    label: "Production",
    config: PRODUCTION_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyProductionExpertRow,
  },
]

type LabelDrift = {
  channel: string
  key: string
  gridLabel: string
  cardLabel: string
}

type ChannelReport = {
  channel: string
  pass: boolean
  drifts: LabelDrift[]
  errors: string[]
}

/** Mirrors ExpertGrid Enter / ArrowDown row advance (keyboard-nav). */
function nextRowDown(rowIndex: number, rowCount: number): number {
  return Math.min(rowIndex + 1, rowCount - 1)
}

function nextRowUp(rowIndex: number): number {
  return Math.max(rowIndex - 1, 0)
}

function findBuyTypeColumn(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
): ExpertDescriptorColumn | undefined {
  return getExpertGridSurfaceFields(config).find((c) => c.key === "buyType")
}

function findPasteableTextColumn(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
): ExpertDescriptorColumn | undefined {
  return getExpertGridSurfaceFields(config).find(
    (c) =>
      c.kind === "text" &&
      !c.readOnly &&
      c.key !== "buyType" &&
      // Prefer creative/placement when present — stable paste targets.
      true
  )
}

function applyPasteToRow<T extends ExpertScheduleRowCommon>(
  row: T,
  column: ExpertDescriptorColumn,
  raw: string
): T {
  const value = column.normalizePaste
    ? column.normalizePaste(raw, { publisherNames: [] })
    : raw
  return { ...row, [column.key]: value }
}

function collectHeaderCardDrifts(
  channel: string,
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
): LabelDrift[] {
  const gridByKey = new Map(
    getExpertGridSurfaceFields(config).map((c) => [c.key, c.label])
  )
  const cardByKey = new Map(
    getExpertCardSurfaceFields(config).map((c) => [c.key, c.label])
  )
  const drifts: LabelDrift[] = []
  for (const [key, gridLabel] of gridByKey) {
    if (!cardByKey.has(key)) continue
    const cardLabel = cardByKey.get(key)!
    if (gridLabel !== cardLabel) {
      drifts.push({ channel, key, gridLabel, cardLabel })
    }
  }
  return drifts
}

function assertHeadMatchesBody(
  label: string,
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
) {
  const head = expertGridDescriptorHeadLabels(config, false)
  const body = expertGridBodyDescriptorColumns(config, false)
  // Head = billing flags + body labels + trailing; body labels are contiguous
  // after billing. Compare body labels as a subsequence of head.
  const bodyLabels = body.map((c) => c.label)
  let hi = 0
  for (const bl of bodyLabels) {
    while (hi < head.length && head[hi] !== bl) hi++
    assert.ok(
      hi < head.length,
      `${label}: body label "${bl}" missing from head labels [${head.join(", ")}]`
    )
    hi++
  }
}

function runChannelInteractive(entry: ChannelEntry): ChannelReport {
  const { label, config, createEmpty } = entry
  const errors: string[] = []
  const drifts = collectHeaderCardDrifts(label, config)

  try {
    assertHeadMatchesBody(label, config)

    const cardRendered = getExpertCardRenderedFields(config)
    const cardSurface = getExpertCardSurfaceFields(config).map((c) => ({
      key: c.key,
      label: c.label,
    }))
    assert.deepEqual(
      cardRendered,
      cardSurface,
      `${label}: getExpertCardRenderedFields !== card surface fields`
    )

    if (drifts.length > 0) {
      errors.push(
        `header!=card FormLabel drift: ${drifts
          .map((d) => `${d.key} grid="${d.gridLabel}" card="${d.cardLabel}"`)
          .join("; ")}`
      )
    }

    const textCol = findPasteableTextColumn(config)
    assert.ok(textCol, `${label}: no pasteable text column on grid surface`)

    const row0 = createEmpty(`${label}-0`, CS, CE, WEEK_KEYS)
    const row1 = createEmpty(`${label}-1`, CS, CE, WEEK_KEYS)
    const row2 = createEmpty(`${label}-2`, CS, CE, WEEK_KEYS)

    const pasteRaw = `paste-${label}-${textCol!.key}`
    const pasted = applyPasteToRow(row0, textCol!, pasteRaw)
    assert.equal(
      getRowString(pasted, textCol!.key),
      textCol!.normalizePaste
        ? textCol!.normalizePaste(pasteRaw, { publisherNames: [] })
        : pasteRaw,
      `${label}: paste did not write ${textCol!.key}`
    )

    const fillCol = {
      key: textCol!.key,
      kind: textCol!.kind,
      normalizePaste: textCol!.normalizePaste,
      readOnly: textCol!.readOnly,
    }
    const seeded = [
      { ...pasted },
      { ...row1, [textCol!.key]: "old-1" },
      { ...row2, [textCol!.key]: "old-2" },
    ]

    const allBelow = applyExpertFillDown({
      rows: seeded,
      sourceRowIndex: 0,
      column: fillCol,
      range: { mode: "all-below" },
    })
    assert.ok(allBelow, `${label}: all-below fill returned null`)
    const expectedFill = getRowString(pasted, textCol!.key)
    assert.equal(getRowString(allBelow![1], textCol!.key), expectedFill)
    assert.equal(getRowString(allBelow![2], textCol!.key), expectedFill)

    const dragSeeded = [
      { ...pasted },
      { ...row1, [textCol!.key]: "d1" },
      { ...row2, [textCol!.key]: "d2" },
    ]
    const dragged = applyExpertFillDown({
      rows: dragSeeded,
      sourceRowIndex: 0,
      column: fillCol,
      range: { mode: "drag", rowCount: 1 },
    })
    assert.ok(dragged, `${label}: drag fill returned null`)
    assert.equal(getRowString(dragged![1], textCol!.key), expectedFill)
    assert.equal(getRowString(dragged![2], textCol!.key), "d2")

    // Production keeps buyType on the row for hydrate but surfaces: "none"
    // (fixed "production") — no grid buy-type switch UI.
    const buyCol = findBuyTypeColumn(config)
    if (buyCol && buyCol.options && buyCol.options.length >= 2) {
      const optA = buyCol.options[0]!
      const optB = buyCol.options[1]!
      const viaLabel = applyPasteToRow(row0, buyCol, optA.label)
      const viaValue = applyPasteToRow(row0, buyCol, optB.value)
      assert.equal(
        getRowString(viaLabel, "buyType"),
        buyCol.normalizePaste
          ? buyCol.normalizePaste(optA.label, { publisherNames: [] })
          : optA.label
      )
      assert.equal(
        getRowString(viaValue, "buyType"),
        buyCol.normalizePaste
          ? buyCol.normalizePaste(optB.value, { publisherNames: [] })
          : optB.value
      )
      assert.notEqual(
        getRowString(viaLabel, "buyType"),
        getRowString(viaValue, "buyType"),
        `${label}: buy-type switch did not change stored value`
      )

      const buyFill = applyExpertFillDown({
        rows: [
          { ...viaLabel },
          { ...row1, buyType: "" },
          { ...row2, buyType: optB.value },
        ],
        sourceRowIndex: 0,
        column: {
          key: "buyType",
          kind: buyCol.kind,
          normalizePaste: buyCol.normalizePaste,
        },
        range: { mode: "all-below" },
      })
      assert.ok(buyFill, `${label}: buyType fill returned null`)
      const buyFilled = getRowString(viaLabel, "buyType")
      assert.equal(getRowString(buyFill![1], "buyType"), buyFilled)
      assert.equal(getRowString(buyFill![2], "buyType"), buyFilled)
    } else if (label === "Production") {
      assert.equal(
        getRowString(row0, "buyType"),
        "production",
        "Production rows keep fixed buyType for hydrate"
      )
      assert.equal(
        buyCol,
        undefined,
        "Production buyType must stay off the grid surface"
      )
    } else {
      assert.fail(`${label}: missing buyType column with ≥2 options`)
    }

    // Keyboard-nav: cell id continuity + Enter/Arrow deltas (DOM focus needs browser).
    const gridId = `eg-${label}`
    assert.equal(expertGridCellId(gridId, 0, 2), `${gridId}-r0-c2`)
    assert.equal(expertGridCellId(gridId, 1, 2), `${gridId}-r1-c2`)
    assert.equal(nextRowDown(0, 3), 1)
    assert.equal(nextRowDown(2, 3), 2)
    assert.equal(nextRowUp(0), 0)
    assert.equal(nextRowUp(2), 1)
    assert.equal(
      expertGridCellId(gridId, nextRowDown(0, 3), 2),
      expertGridCellId(gridId, 1, 2),
      `${label}: Enter should target next-row same column`
    )

    if (label === "DigiVideo") {
      const grid = getExpertGridSurfaceFields(config)
      const card = getExpertCardSurfaceFields(config)
      for (const [key, expectedLabel] of [
        ["placement", "Placement"],
        ["size", "Ad Size"],
      ] as const) {
        const g = grid.find((c) => c.key === key)
        const c = card.find((c) => c.key === key)
        assert.ok(g, `DigiVideo grid missing ${key}`)
        assert.ok(c, `DigiVideo card missing ${key}`)
        assert.equal(g!.label, expectedLabel)
        assert.equal(c!.label, expectedLabel)
        assert.equal(g!.label, c!.label)
      }
    }

    if (label === "Television") {
      const grid = getExpertGridSurfaceFields(config)
      const card = getExpertCardSurfaceFields(config)
      for (const [key, expectedLabel] of [
        ["tarps", "TARPs"],
        ["creative", "Creative Length"],
      ] as const) {
        const g = grid.find((c) => c.key === key)
        const c = card.find((c) => c.key === key)
        assert.ok(g, `Television grid missing ${key}`)
        assert.ok(c, `Television card missing ${key}`)
        assert.equal(g!.label, expectedLabel)
        assert.equal(c!.label, expectedLabel)
        assert.equal(g!.label, c!.label)
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  return {
    channel: label,
    pass: errors.length === 0,
    drifts,
    errors,
  }
}

for (const entry of CHANNELS) {
  test(`${entry.label}: interactive parity (header/paste/fill/buyType/kbd)`, () => {
    const report = runChannelInteractive(entry)
    assert.equal(
      report.pass,
      true,
      `${entry.label} failed:\n${report.errors.join("\n")}`
    )
  })
}

test("interactive parity summary (all 20 channels)", () => {
  const reports: ChannelReport[] = CHANNELS.map(runChannelInteractive)
  assert.equal(reports.length, 20, "expected one report per channel")
  const failed = reports.filter((r) => !r.pass)
  const allDrifts = reports.flatMap((r) => r.drifts)
  const lines = [
    "",
    "=== ExpertGrid interactive parity ===",
    ...reports.map(
      (r) =>
        `${r.pass ? "PASS" : "FAIL"}  ${r.channel}${
          r.drifts.length
            ? `  [drift: ${r.drifts.map((d) => d.key).join(",")}]`
            : ""
        }`
    ),
    allDrifts.length === 0
      ? "Header↔FormLabel drift: none"
      : `Header↔FormLabel drift:\n${allDrifts
          .map(
            (d) =>
              `  ${d.channel}.${d.key}: grid="${d.gridLabel}" card="${d.cardLabel}"`
          )
          .join("\n")}`,
    `Result: ${reports.length - failed.length}/${reports.length} channels pass`,
    "",
  ]
  console.log(lines.join("\n"))
  assert.equal(failed.length, 0, failed.map((f) => f.channel).join(", "))
})
