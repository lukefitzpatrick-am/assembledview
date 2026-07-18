/**
 * Generates lib/mediaplan/containerChannelConfig.ts from
 * scripts/tmp-container-fieldset-diffs.json + known wiring tables.
 *
 * Run: node scripts/generate-container-channel-config.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")
const diffs = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/tmp-container-fieldset-diffs.json"), "utf8"),
)

/** @type {Record<string, {
 *   exportName: string
 *   mediaTypeString: string
 *   mediaTypeIdKey: string
 *   expertConfig: string
 *   schema: string
 *   publisher: string | null
 *   toExpert: string
 * }>} */
const CHANNELS = {
  ProgDisplay: {
    exportName: "PROGDISPLAY_CONTAINER_CONFIG",
    mediaTypeString: "Programmatic Display",
    mediaTypeIdKey: "progDisplay",
    expertConfig: "PROGDISPLAY_EXPERT_CHANNEL_CONFIG",
    schema: "progDisplayFormSchema",
    publisher: "getPublishersForProgDisplay",
    toExpert: "mapStandardProgDisplayLineItemsToExpertRows",
  },
  ProgVideo: {
    exportName: "PROGVIDEO_CONTAINER_CONFIG",
    mediaTypeString: "Programmatic Video",
    mediaTypeIdKey: "progVideo",
    expertConfig: "PROGVIDEO_EXPERT_CHANNEL_CONFIG",
    schema: "progVideoFormSchema",
    publisher: "getPublishersForProgVideo",
    toExpert: "mapStandardProgVideoLineItemsToExpertRows",
  },
  ProgBVOD: {
    exportName: "PROGBVOD_CONTAINER_CONFIG",
    mediaTypeString: "Programmatic BVOD",
    mediaTypeIdKey: "progBVOD",
    expertConfig: "PROGBVOD_EXPERT_CHANNEL_CONFIG",
    schema: "progBvodFormSchema",
    publisher: "getPublishersForProgBvod",
    toExpert: "mapStandardProgBvodLineItemsToExpertRows",
  },
  ProgAudio: {
    exportName: "PROGAUDIO_CONTAINER_CONFIG",
    mediaTypeString: "Programmatic Audio",
    mediaTypeIdKey: "progAudio",
    expertConfig: "PROGAUDIO_EXPERT_CHANNEL_CONFIG",
    schema: "progAudioFormSchema",
    publisher: "getPublishersForProgAudio",
    toExpert: "mapStandardProgAudioLineItemsToExpertRows",
  },
  ProgOOH: {
    exportName: "PROGOOH_CONTAINER_CONFIG",
    mediaTypeString: "Programmatic OOH",
    mediaTypeIdKey: "progOOH",
    expertConfig: "PROGOOH_EXPERT_CHANNEL_CONFIG",
    schema: "progOOHFormSchema",
    publisher: "getPublishersForProgOoh",
    toExpert: "mapStandardProgOohLineItemsToExpertRows",
  },
  DigitalDisplay: {
    exportName: "DIGITALDISPLAY_CONTAINER_CONFIG",
    mediaTypeString: "Digital Display",
    mediaTypeIdKey: "digitalDisplay",
    expertConfig: "DIGITALDISPLAY_EXPERT_CHANNEL_CONFIG",
    schema: "digidisplayFormSchema",
    publisher: "getPublishersForDigiDisplay",
    toExpert: "mapStandardDigiDisplayLineItemsToExpertRows",
  },
  DigitalVideo: {
    exportName: "DIGITALVIDEO_CONTAINER_CONFIG",
    mediaTypeString: "Digital Video",
    mediaTypeIdKey: "digitalVideo",
    expertConfig: "DIGIVIDEO_EXPERT_CHANNEL_CONFIG",
    schema: "digivideoFormSchema",
    publisher: "getPublishersForDigiVideo",
    toExpert: "mapStandardDigiVideoLineItemsToExpertRows",
  },
  DigitalAudio: {
    exportName: "DIGITALAUDIO_CONTAINER_CONFIG",
    mediaTypeString: "Digital Audio",
    mediaTypeIdKey: "digitalAudio",
    expertConfig: "DIGIAUDIO_EXPERT_CHANNEL_CONFIG",
    schema: "digiAudioFormSchema",
    publisher: "getPublishersForDigiAudio",
    toExpert: "mapStandardDigiAudioLineItemsToExpertRows",
  },
  BVOD: {
    exportName: "BVOD_CONTAINER_CONFIG",
    mediaTypeString: "BVOD",
    mediaTypeIdKey: "bvod",
    expertConfig: "BVOD_EXPERT_CHANNEL_CONFIG",
    schema: "bvodFormSchema",
    publisher: "getPublishersForBvod",
    toExpert: "mapStandardBvodLineItemsToExpertRows",
  },
  Television: {
    exportName: "TELEVISION_CONTAINER_CONFIG",
    mediaTypeString: "Television",
    mediaTypeIdKey: "television",
    expertConfig: "TELEVISION_EXPERT_CHANNEL_CONFIG",
    schema: "televisionFormSchema",
    publisher: "getPublishersForTelevision",
    toExpert: "mapStandardTvLineItemsToExpertRows",
  },
  Radio: {
    exportName: "RADIO_CONTAINER_CONFIG",
    mediaTypeString: "Radio",
    mediaTypeIdKey: "radio",
    expertConfig: "RADIO_EXPERT_CHANNEL_CONFIG",
    schema: "radioFormSchema",
    publisher: "getPublishersForRadio",
    toExpert: "mapStandardRadioLineItemsToExpertRows",
  },
  Search: {
    exportName: "SEARCH_CONTAINER_CONFIG",
    mediaTypeString: "Search",
    mediaTypeIdKey: "search",
    expertConfig: "SEARCH_EXPERT_CHANNEL_CONFIG",
    schema: "searchFormSchema",
    publisher: "getPublishersForSearch",
    toExpert: "mapStandardSearchLineItemsToExpertRows",
  },
  SocialMedia: {
    exportName: "SOCIALMEDIA_CONTAINER_CONFIG",
    mediaTypeString: "Social Media",
    mediaTypeIdKey: "socialMedia",
    expertConfig: "SOCIALMEDIA_EXPERT_CHANNEL_CONFIG",
    schema: "socialMediaFormSchema",
    publisher: "getPublishersForSocialMedia",
    toExpert: "mapStandardSocialMediaLineItemsToExpertRows",
  },
  Influencers: {
    exportName: "INFLUENCERS_CONTAINER_CONFIG",
    mediaTypeString: "Influencers",
    mediaTypeIdKey: "influencers",
    expertConfig: "INFLUENCERS_EXPERT_CHANNEL_CONFIG",
    schema: "influencersFormSchema",
    publisher: "getPublishersForInfluencers",
    toExpert: "mapStandardInfluencersLineItemsToExpertRows",
  },
  Integration: {
    exportName: "INTEGRATION_CONTAINER_CONFIG",
    mediaTypeString: "Integration",
    mediaTypeIdKey: "integration",
    expertConfig: "INTEGRATION_EXPERT_CHANNEL_CONFIG",
    schema: "integrationFormSchema",
    publisher: "getPublishersForIntegration",
    toExpert: "mapStandardIntegrationLineItemsToExpertRows",
  },
  OOH: {
    exportName: "OOH_CONTAINER_CONFIG",
    mediaTypeString: "OOH",
    mediaTypeIdKey: "ooh",
    expertConfig: "OOH_EXPERT_CHANNEL_CONFIG",
    schema: "oohFormSchema",
    publisher: "getPublishersForOoh",
    toExpert: "mapStandardOohLineItemsToExpertRows",
  },
  Cinema: {
    exportName: "CINEMA_CONTAINER_CONFIG",
    mediaTypeString: "Cinema",
    mediaTypeIdKey: "cinema",
    expertConfig: "CINEMA_EXPERT_CHANNEL_CONFIG",
    schema: "cinemaFormSchema",
    publisher: "getPublishersForCinema",
    toExpert: "mapStandardCinemaLineItemsToExpertRows",
  },
  Newspaper: {
    exportName: "NEWSPAPER_CONTAINER_CONFIG",
    mediaTypeString: "Newspaper",
    mediaTypeIdKey: "newspaper",
    expertConfig: "NEWSPAPER_EXPERT_CHANNEL_CONFIG",
    schema: "newspapersFormSchema",
    publisher: "getPublishersForNewspapers",
    toExpert: "mapStandardNewspaperLineItemsToExpertRows",
  },
  Magazines: {
    exportName: "MAGAZINES_CONTAINER_CONFIG",
    mediaTypeString: "Magazines",
    mediaTypeIdKey: "magazines",
    expertConfig: "MAGAZINES_EXPERT_CHANNEL_CONFIG",
    schema: "magazinesFormSchema",
    publisher: "getPublishersForMagazines",
    toExpert: "mapStandardMagazineLineItemsToExpertRows",
  },
  Production: {
    exportName: "PRODUCTION_CONTAINER_CONFIG",
    mediaTypeString: "Production",
    mediaTypeIdKey: "production",
    expertConfig: "PRODUCTION_EXPERT_CHANNEL_CONFIG",
    schema: "productionFormSchema",
    publisher: null,
    toExpert: "mapStandardProductionLineItemsToExpertRows",
  },
}

function lit(v) {
  if (typeof v === "string") return JSON.stringify(v)
  if (typeof v === "boolean" || typeof v === "number") return String(v)
  if (v === null) return "null"
  return JSON.stringify(v)
}

function emitFieldMap(candidates) {
  const lines = ["["]
  for (const c of candidates) {
    // Magazines api-only format(no formKey) — skip orphan api-only without camel
    if (!c.camel) continue
    lines.push("    {")
    lines.push(`      camel: ${lit(c.camel)},`)
    lines.push(`      snake: ${lit(c.snake)},`)
    lines.push(`      excel: ${lit(c.excel ?? null)},`)
    lines.push(`      default: ${lit(c.default)},`)
    lines.push(`      inDefaults: ${lit(!!c.inDefaults)},`)
    lines.push(`      inHydration: ${lit(!!c.inHydration)},`)
    lines.push(`      inApi: ${lit(!!c.inApi)},`)
    lines.push("    },")
  }
  lines.push("  ]")
  return lines.join("\n")
}

const publisherImports = [
  ...new Set(
    Object.values(CHANNELS)
      .map((c) => c.publisher)
      .filter(Boolean),
  ),
].sort()

const schemaImports = [...new Set(Object.values(CHANNELS).map((c) => c.schema))].sort()
const expertImports = [...new Set(Object.values(CHANNELS).map((c) => c.expertConfig))].sort()
const mapperImports = [...new Set(Object.values(CHANNELS).map((c) => c.toExpert))].sort()

const out = []
out.push(`/**
 * Per-channel container descriptors (§4).
 *
 * Containers still render as today, but READ defaults / hydration / API field
 * lists from these descriptors instead of inline literals.
 *
 * Generated from scripts/tmp-container-fieldset-diffs.json — re-run
 * \`node scripts/generate-container-channel-config.mjs\` after regenerating diffs.
 *
 * Helpers:
 * - buildDefaultLineItem — only fields with inDefaults
 * - mapHydrationToForm — only inHydration; uses || "" / || false (NOT fieldMap.default)
 * - mapFormToApi — only inApi; uses || "" / || false
 */

import type { z } from "zod"
import {
  ${publisherImports.join(",\n  ")},
} from "@/lib/api"
import {
  ${expertImports.join(",\n  ")},
  type ExpertGridChannelConfig,
} from "@/lib/mediaplan/expertGridChannelConfig"
import {
  ${mapperImports.join(",\n  ")},
} from "@/lib/mediaplan/expertChannelMappings"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import {
  ${schemaImports.join(",\n  ")},
} from "@/lib/mediaplan/schemas"

export type FieldMapEntry = {
  camel: string
  snake: string
  excel: string | null
  default: string | boolean | number
  inDefaults: boolean
  inHydration: boolean
  inApi: boolean
}

export type CalculatedVariant =
  | "cpcCpvCpm"
  | "radio"
  | "ooh"
  | "cinema"
  | "newspaper"
  | "magazine"

/** Local publisher shape — matches container-local Publisher interfaces. */
export type ContainerPublisher = {
  id: number
  publisher_name: string
}

export type ContainerChannelConfig = {
  mediaTypeString: string
  mediaTypeIdCode: string
  schema: z.ZodTypeAny
  fetchPublishers: (() => Promise<ContainerPublisher[]>) | null
  toExpert: (...args: any[]) => any
  fromExpert: null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gridConfig: ExpertGridChannelConfig<any>
  calculatedVariant: CalculatedVariant
  hasBursts: boolean
  fieldMap: FieldMapEntry[]
}

/** Build a fresh line-item defaults object from fieldMap (inDefaults only). */
export function buildDefaultLineItem(
  fieldMap: FieldMapEntry[],
): Record<string, string | boolean | number> {
  const out: Record<string, string | boolean | number> = {}
  for (const entry of fieldMap) {
    if (!entry.inDefaults) continue
    out[entry.camel] = entry.default
  }
  return out
}

/**
 * Map an API/persisted line item → form camelCase fields (inHydration only).
 * Mirrors current transforms: string fields || "", booleans || false.
 * Does NOT fall back to fieldMap.default (preserves Television buy_type → "").
 */
export function mapHydrationToForm(
  fieldMap: FieldMapEntry[],
  apiItem: Record<string, unknown> | null | undefined,
): Record<string, string | boolean> {
  const src = apiItem ?? {}
  const out: Record<string, string | boolean> = {}
  for (const entry of fieldMap) {
    if (!entry.inHydration) continue
    const raw = src[entry.snake] ?? src[entry.camel]
    if (typeof entry.default === "boolean") {
      out[entry.camel] = Boolean(raw) || false
    } else {
      out[entry.camel] = (raw as string | undefined) || ""
    }
  }
  return out
}

/**
 * Map a form line item → API snake_case fields (inApi only).
 * Mirrors current transforms: string fields || "", booleans || false.
 */
export function mapFormToApi(
  fieldMap: FieldMapEntry[],
  formItem: Record<string, unknown> | null | undefined,
): Record<string, string | boolean> {
  const src = formItem ?? {}
  const out: Record<string, string | boolean> = {}
  for (const entry of fieldMap) {
    if (!entry.inApi) continue
    const raw = src[entry.camel]
    if (typeof entry.default === "boolean") {
      out[entry.snake] = Boolean(raw) || false
    } else {
      out[entry.snake] = (raw as string | undefined) || ""
    }
  }
  return out
}

`)

for (const [channel, wiring] of Object.entries(CHANNELS)) {
  const data = diffs[channel]
  if (!data) {
    console.error(`Missing diffs for ${channel}`)
    process.exit(1)
  }
  const variant = data.meta.calculatedVariant
  const hasBursts = !!data.meta.hasBursts
  const fieldMap = emitFieldMap(data.fieldMapCandidates)

  out.push(`export const ${wiring.exportName}: ContainerChannelConfig = {`)
  out.push(`  mediaTypeString: ${lit(wiring.mediaTypeString)},`)
  out.push(`  mediaTypeIdCode: MEDIA_TYPE_ID_CODES.${wiring.mediaTypeIdKey},`)
  out.push(`  schema: ${wiring.schema},`)
  out.push(
    wiring.publisher
      ? `  fetchPublishers: ${wiring.publisher},`
      : `  fetchPublishers: null,`,
  )
  out.push(`  toExpert: ${wiring.toExpert},`)
  out.push(`  fromExpert: null,`)
  out.push(`  gridConfig: ${wiring.expertConfig},`)
  out.push(`  calculatedVariant: ${lit(variant)},`)
  out.push(`  hasBursts: ${lit(hasBursts)},`)
  out.push(`  fieldMap: ${fieldMap},`)
  out.push(`}`)
  out.push(``)
}

// Registry for lookup
out.push(`export const CONTAINER_CHANNEL_CONFIGS = {`)
for (const [channel, wiring] of Object.entries(CHANNELS)) {
  out.push(`  ${channel}: ${wiring.exportName},`)
}
out.push(`} as const`)
out.push(``)
out.push(`export type ContainerChannelKey = keyof typeof CONTAINER_CHANNEL_CONFIGS`)
out.push(``)

const dest = path.join(root, "lib/mediaplan/containerChannelConfig.ts")
fs.writeFileSync(dest, out.join("\n"), "utf8")
console.log(`Wrote ${dest}`)
console.log(`Channels: ${Object.keys(CHANNELS).length}`)
