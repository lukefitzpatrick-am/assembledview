/**
 * Material Instructions publisher library — types, alias map, and loader.
 * Library JSON is vendored verbatim under `lib/specs/mi-library/`; never edited repo-side.
 */

import fs from "node:fs"
import path from "node:path"

export type MiFormatText = Record<string, string> | string | undefined

export type MiFormatRecord = {
  format_name: string
  container?: string
  placement?: string
  file_type?: string | string[]
  ratios?: string[]
  ratios_supported?: string[]
  ratio?: string
  ratio_recommended?: string
  dimensions?: Record<string, string> | string
  max_file_size?: string
  text?: MiFormatText
  duration?: string
  duration_max?: string
  duration_recommended?: string
  supply_deadline_rule?: string
  naming_convention?: string
  best_practice_notes?: string[]
  restrictions?: string | string[]
  /** Optional — most formats omit this. */
  aliases?: string[]
  [key: string]: unknown
}

export type MiCivicPanelGroup = {
  panel_type: string
  dimensions: string
  sites: string[]
}

export type MiCivicIndividualSite = {
  site: string
  dimensions: string
  restrictions?: string
  notes?: string
}

/** Civic Outdoor uses a site catalogue instead of a normal formats[]. */
export type MiCivicOutdoorPublisher = {
  publisher_slug: string
  publisher_name: string
  container_category: string
  last_refreshed: string
  source?: string
  source_url?: string
  universal_specs?: Record<string, unknown>
  panel_groups?: MiCivicPanelGroup[]
  individual_sites?: MiCivicIndividualSite[]
  supply_deadline_rule?: string
  best_practice_notes?: string[]
  formats?: MiFormatRecord[]
  [key: string]: unknown
}

export type MiPublisherRecord = {
  publisher_slug: string
  publisher_name: string
  last_refreshed: string
  /** Prefer this; civic-outdoor uses `container_category` instead. */
  container_category_default?: string
  container_category?: string
  /** Either `source` or any `source_*` key must be present. */
  source?: string
  formats?: MiFormatRecord[]
  [key: string]: unknown
}

export type MiLibraryVersion = {
  importedAt: string
  sourceZip: string
  publisherCount: number
  formatCount: number
}

export type MiTemplateStructure = {
  version: string
  description?: string
  section_colours: Record<string, string>
  tabs: Record<
    string,
    {
      AM: string[]
      SPECS: string[]
      CLIENT: string[]
    }
  >
  meta_sheet: { fields: string[] }
}

/** Ported from resolve_specs.py PUBLISHER_ALIASES. */
export const PUBLISHER_ALIASES: Record<string, string> = {
  "google ads": "google-ads",
  google: "google-ads",
  meta: "meta",
  facebook: "meta",
  instagram: "meta",
  fb: "meta",
  tiktok: "tiktok",
  "tik tok": "tiktok",
  youtube: "youtube",
  "youtube - dv360": "youtube",
  "youtube dv360": "youtube",
  dv360: "assembled-programmatic",
  "campaign manager 360": "assembled-programmatic",
  cm360: "assembled-programmatic",
  "civic outdoor": "civic-outdoor",
  "ooh!media": "ooh-media",
  "ooh! media": "ooh-media",
  "ooh media": "ooh-media",
  cartology: "cartology",
  jcdecaux: "jcdecaux",
  qms: "qms",
  tonic: "tonic",
  "tonic media network": "tonic",
  "news corp": "news-corp",
  newscorp: "news-corp",
  nine: "nine",
  "nine publishing": "nine",
  seven: "seven",
  "seven network": "seven",
  "channel seven": "seven",
  ten: "ten",
  "channel 10": "ten",
  linkby: "linkby",
  quantcast: "quantcast",
  twitch: "twitch",
  "amazon ads": "twitch",
}

const BUYING_PLATFORM_SUFFIX =
  /\s*-\s*(am|dv360|cm360)\s*$/i

/** Strip trailing ` - AM` / ` - DV360` / ` - CM360` buying-platform suffixes. */
export function stripBuyingPlatformSuffix(publisher: string): string {
  return publisher.replace(BUYING_PLATFORM_SUFFIX, "").trim()
}

export function slugifyPublisher(publisher: string): string {
  if (!publisher) return ""
  const stripped = stripBuyingPlatformSuffix(publisher)
  const p = stripped.trim().toLowerCase()
  if (PUBLISHER_ALIASES[p]) return PUBLISHER_ALIASES[p]
  // Case-insensitive alias keys that preserve punctuation (e.g. oOh!media)
  for (const [alias, slug] of Object.entries(PUBLISHER_ALIASES)) {
    if (alias.toLowerCase() === p) return slug
  }
  return p.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

export function miLibraryDir(): string {
  return path.join(process.cwd(), "lib", "specs", "mi-library")
}

function hasSourceKey(record: Record<string, unknown>): boolean {
  for (const key of Object.keys(record)) {
    if (key === "source" || key.startsWith("source_")) return true
  }
  return false
}

function hasContainerCategory(record: Record<string, unknown>): boolean {
  return (
    typeof record.container_category_default === "string" ||
    typeof record.container_category === "string"
  )
}

/** Non-canonical file-type / size key variants that must not appear. */
const FORBIDDEN_KEY_VARIANTS = [
  "filetype",
  "fileType",
  "file_types",
  "maxfilesize",
  "maxFileSize",
  "max_filesize",
  "file_size_max",
]

function collectKeys(value: unknown, into: Set<string>): void {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into)
    return
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    into.add(k)
    collectKeys(v, into)
  }
}

export type MiLibraryValidationIssue = {
  file: string
  message: string
}

/**
 * Validate a publisher library JSON object against the sync-gate rules.
 * Unknown extra top-level keys are allowed and preserved.
 */
export function validatePublisherJson(
  file: string,
  raw: unknown,
): MiLibraryValidationIssue[] {
  const issues: MiLibraryValidationIssue[] = []
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [{ file, message: "root must be a JSON object" }]
  }
  const record = raw as Record<string, unknown>

  if (typeof record.publisher_slug !== "string" || !record.publisher_slug.trim()) {
    issues.push({ file, message: "publisher_slug missing" })
  }
  if (typeof record.publisher_name !== "string" || !record.publisher_name.trim()) {
    issues.push({ file, message: "publisher_name missing" })
  }
  if (typeof record.last_refreshed !== "string" || !record.last_refreshed.trim()) {
    issues.push({ file, message: "last_refreshed missing" })
  }
  if (!hasSourceKey(record)) {
    issues.push({ file, message: "source or source_* key required" })
  }
  if (!hasContainerCategory(record)) {
    issues.push({
      file,
      message: "container_category_default or container_category required",
    })
  }

  const keys = new Set<string>()
  collectKeys(record, keys)
  for (const bad of FORBIDDEN_KEY_VARIANTS) {
    if (keys.has(bad)) {
      issues.push({ file, message: `non-canonical key variant: ${bad}` })
    }
  }

  if (record.formats !== undefined && !Array.isArray(record.formats)) {
    issues.push({ file, message: "formats must be an array when present" })
  }

  if (Array.isArray(record.formats)) {
    for (const [i, fmt] of record.formats.entries()) {
      if (!fmt || typeof fmt !== "object" || Array.isArray(fmt)) {
        issues.push({ file, message: `formats[${i}] must be an object` })
        continue
      }
      const f = fmt as Record<string, unknown>
      if (typeof f.format_name !== "string" || !f.format_name.trim()) {
        issues.push({ file, message: `formats[${i}].format_name missing` })
      }
      // aliases optional — never required
    }
  }

  return issues
}

export function listPublisherLibraryFiles(dir = miLibraryDir()): string[] {
  return fs
    .readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith(".json") &&
        name !== "VERSION.json" &&
        name !== "template_structure.json",
    )
    .sort()
}

export function loadMiLibraryVersion(dir = miLibraryDir()): MiLibraryVersion {
  const raw = JSON.parse(
    fs.readFileSync(path.join(dir, "VERSION.json"), "utf8"),
  ) as MiLibraryVersion
  return raw
}

export function loadTemplateStructure(dir = miLibraryDir()): MiTemplateStructure {
  return JSON.parse(
    fs.readFileSync(path.join(dir, "template_structure.json"), "utf8"),
  ) as MiTemplateStructure
}

export type LoadedMiLibrary = {
  bySlug: Map<string, MiPublisherRecord>
  publishers: MiPublisherRecord[]
  formatCount: number
  version: MiLibraryVersion
}

/**
 * Load all publisher JSONs. Extra keys are preserved on each record.
 */
export function loadMiLibrary(dir = miLibraryDir()): LoadedMiLibrary {
  const files = listPublisherLibraryFiles(dir)
  const bySlug = new Map<string, MiPublisherRecord>()
  const publishers: MiPublisherRecord[] = []
  let formatCount = 0

  for (const file of files) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, file), "utf8"),
    ) as MiPublisherRecord
    const issues = validatePublisherJson(file, raw)
    if (issues.length > 0) {
      throw new Error(
        `MI library validation failed for ${file}: ${issues
          .map((i) => i.message)
          .join("; ")}`,
      )
    }
    if (bySlug.has(raw.publisher_slug)) {
      throw new Error(`Duplicate publisher_slug: ${raw.publisher_slug}`)
    }
    bySlug.set(raw.publisher_slug, raw)
    publishers.push(raw)
    if (Array.isArray(raw.formats)) formatCount += raw.formats.length
  }

  return {
    bySlug,
    publishers,
    formatCount,
    version: loadMiLibraryVersion(dir),
  }
}

export function isCivicOutdoor(
  record: MiPublisherRecord,
): record is MiCivicOutdoorPublisher & MiPublisherRecord {
  return record.publisher_slug === "civic-outdoor"
}
