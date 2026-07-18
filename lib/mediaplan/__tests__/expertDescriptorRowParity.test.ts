/**
 * Per-channel: descriptor keys (core + tail, incl. surfaces:"none") must equal
 * empty-row keys minus schedule shell / optionFlags / grossCost.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  expertDescriptorAllKeys,
  getExpertOptionFlags,
  type ExpertGridChannelConfig,
  type ExpertScheduleRowCommon,
  SEARCH_EXPERT_CHANNEL_CONFIG,
  createEmptySearchExpertRow,
  PROGVIDEO_EXPERT_CHANNEL_CONFIG,
  createEmptyProgVideoExpertRow,
  PROGDISPLAY_EXPERT_CHANNEL_CONFIG,
  createEmptyProgDisplayExpertRow,
  PROGAUDIO_EXPERT_CHANNEL_CONFIG,
  createEmptyProgAudioExpertRow,
  PROGBVOD_EXPERT_CHANNEL_CONFIG,
  createEmptyProgBvodExpertRow,
  PROGOOH_EXPERT_CHANNEL_CONFIG,
  createEmptyProgOohExpertRow,
  SOCIALMEDIA_EXPERT_CHANNEL_CONFIG,
  createEmptySocialMediaExpertRow,
  OOH_EXPERT_CHANNEL_CONFIG,
  createEmptyOohExpertRow,
  DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG,
  createEmptyDigitalDisplayExpertRow,
  DIGIVIDEO_EXPERT_CHANNEL_CONFIG,
  createEmptyDigiVideoExpertRow,
  DIGIAUDIO_EXPERT_CHANNEL_CONFIG,
  createEmptyDigitalAudioExpertRow,
  BVOD_EXPERT_CHANNEL_CONFIG,
  createEmptyBvodExpertRow,
  TELEVISION_EXPERT_CHANNEL_CONFIG,
  createEmptyTelevisionExpertRow,
  RADIO_EXPERT_CHANNEL_CONFIG,
  createEmptyRadioExpertRow,
  CINEMA_EXPERT_CHANNEL_CONFIG,
  createEmptyCinemaExpertRow,
  NEWSPAPER_EXPERT_CHANNEL_CONFIG,
  createEmptyNewspaperExpertRow,
  MAGAZINES_EXPERT_CHANNEL_CONFIG,
  createEmptyMagazinesExpertRow,
  INFLUENCERS_EXPERT_CHANNEL_CONFIG,
  createEmptyInfluencersExpertRow,
  INTEGRATION_EXPERT_CHANNEL_CONFIG,
  createEmptyIntegrationExpertRow,
  PRODUCTION_EXPERT_CHANNEL_CONFIG,
  createEmptyProductionExpertRow,
} from "@/lib/mediaplan/expertGridChannelConfig"

const SHELL_KEYS = new Set([
  "id",
  "weeklyValues",
  "dailyValues",
  "mergedWeekSpans",
  "grossCost",
  "sourceLineItemId",
])

function sorted(keys: Iterable<string>): string[] {
  return [...keys].sort()
}

function rowKeysForParity(
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  row: ExpertScheduleRowCommon
): string[] {
  const optionKeys = new Set(getExpertOptionFlags(config).map((f) => f.key))
  return sorted(
    Object.keys(row).filter((k) => !SHELL_KEYS.has(k) && !optionKeys.has(k))
  )
}

function assertDescriptorRowParity(
  label: string,
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>,
  createEmpty: (
    id: string,
    campaignStartDate: Date,
    campaignEndDate: Date,
    weekKeys: string[]
  ) => ExpertScheduleRowCommon
) {
  const start = new Date("2026-01-01")
  const end = new Date("2026-01-31")
  const row = createEmpty("parity-row", start, end, ["2026-01-05"])
  const descriptorKeys = sorted(expertDescriptorAllKeys(config))
  const rowKeys = rowKeysForParity(config, row)
  assert.deepEqual(
    descriptorKeys,
    rowKeys,
    `${label}: descriptor keys !== row keys\n  descriptor: ${descriptorKeys.join(",")}\n  row:        ${rowKeys.join(",")}`
  )
}

const CHANNELS: {
  label: string
  config: ExpertGridChannelConfig<ExpertScheduleRowCommon>
  createEmpty: (
    id: string,
    campaignStartDate: Date,
    campaignEndDate: Date,
    weekKeys: string[]
  ) => ExpertScheduleRowCommon
}[] = [
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
    label: "ProgBVOD",
    config: PROGBVOD_EXPERT_CHANNEL_CONFIG,
    createEmpty: createEmptyProgBvodExpertRow,
  },
  {
    label: "ProgOOH",
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

for (const { label, config, createEmpty } of CHANNELS) {
  test(`${label}: descriptor keys == row-type keys`, () => {
    assertDescriptorRowParity(label, config, createEmpty)
  })
}
