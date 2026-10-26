/**
 * FB-2 invoice line descriptors (Luke, 27 Oct 2026).
 *
 * One media line on an invoice reads "<supplier> - <detail>", built from the
 * plan line itself (`line_items` columns plus `attrs`). The table below is the
 * confirmed rule; change a row here and every finance download follows.
 *
 * Raw snake_case keys are humanised ("large_format" -> "Large format",
 * "maximize_conversions" -> "Maximize conversions"). Luke confirmed that
 * wording, so there are no display maps.
 */

/** A field on the plan line: a column (`publisher`, `platform`, `bid_strategy`) or an `attrs` key. */
type DescriptorField =
  | "publisher"
  | "platform"
  | "bid_strategy"
  | "network"
  | "station"
  | "placement"
  | "format"
  | "title"
  | "site"
  | "campaign"

/** First non-blank field wins. */
type DescriptorRule = { supplier: readonly DescriptorField[]; detail: readonly DescriptorField[] }

const PLATFORM_BID: DescriptorRule = { supplier: ["platform"], detail: ["bid_strategy"] }
const PUBLISHER_SITE: DescriptorRule = { supplier: ["publisher"], detail: ["site"] }
const NETWORK_TITLE: DescriptorRule = { supplier: ["network", "publisher"], detail: ["title"] }

/** Confirmed descriptor table, keyed by billing schedule media key. Production is a service line. */
export const INVOICE_DESCRIPTOR_RULES: Readonly<Record<string, DescriptorRule>> = {
  search: PLATFORM_BID,
  socialMedia: PLATFORM_BID,
  progDisplay: PLATFORM_BID,
  progVideo: PLATFORM_BID,
  progBvod: PLATFORM_BID,
  progAudio: PLATFORM_BID,
  progOoh: PLATFORM_BID,
  integration: PLATFORM_BID,
  television: { supplier: ["network"], detail: ["station", "placement"] },
  radio: { supplier: ["network", "platform"], detail: ["station"] },
  cinema: { supplier: ["network"], detail: ["station", "format"] },
  newspaper: NETWORK_TITLE,
  magazines: NETWORK_TITLE,
  ooh: { supplier: ["network"], detail: ["format"] },
  digiDisplay: PUBLISHER_SITE,
  digiAudio: PUBLISHER_SITE,
  digiVideo: PUBLISHER_SITE,
  bvod: PUBLISHER_SITE,
  influencers: { supplier: ["platform"], detail: ["campaign"] },
}

export type InvoiceDescriptorInput = {
  mediaKey: string
  publisher?: string | null
  platform?: string | null
  bidStrategy?: string | null
  attrs?: Record<string, unknown> | null
}

export type InvoiceDescriptor = { supplier: string; detail: string; label: string }

function clean(value: unknown): string {
  if (value == null) return ""
  if (typeof value !== "string" && typeof value !== "number") return ""
  return String(value).trim().replace(/\s+/g, " ")
}

/**
 * Neutral humaniser for raw keys only: a value with no spaces and at least one
 * underscore, all lower case ("large_format" -> "Large format"). Anything else
 * (real names such as "Foxtel Media", "TVB APP") is returned trimmed, unchanged.
 * Key fields (bid strategy, format) also sentence-case a single lower-case key
 * ("reach" -> "Reach").
 */
export function humaniseDescriptorValue(value: string, keyField = false): string {
  const t = clean(value)
  const isKey = keyField
    ? /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(t)
    : /^[a-z0-9]+(_[a-z0-9]+)+$/.test(t)
  if (!isKey) return t
  const words = t.split("_").join(" ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Fields that hold option keys rather than names. */
const KEY_FIELDS: ReadonlySet<DescriptorField> = new Set<DescriptorField>(["bid_strategy", "format"])

function fieldValue(input: InvoiceDescriptorInput, field: DescriptorField): string {
  if (field === "publisher") return clean(input.publisher) || clean(input.attrs?.publisher)
  if (field === "platform") return clean(input.platform) || clean(input.attrs?.platform)
  if (field === "bid_strategy") {
    return clean(input.bidStrategy) || clean(input.attrs?.bid_strategy) || clean(input.attrs?.bidStrategy)
  }
  return clean(input.attrs?.[field])
}

function firstValue(input: InvoiceDescriptorInput, fields: readonly DescriptorField[]): string {
  for (const f of fields) {
    const v = fieldValue(input, f)
    if (v) return humaniseDescriptorValue(v, KEY_FIELDS.has(f))
  }
  return ""
}

export function invoiceDescriptorLabel(supplier: string, detail: string): string {
  if (supplier && detail) return `${supplier} - ${detail}`
  return supplier || detail
}

/** Descriptor for one plan line. Null when the media key has no rule (production, unknown). */
export function invoiceDescriptor(input: InvoiceDescriptorInput): InvoiceDescriptor | null {
  const rule = INVOICE_DESCRIPTOR_RULES[input.mediaKey]
  if (!rule) return null
  const supplier = firstValue(input, rule.supplier)
  const detail = firstValue(input, rule.detail)
  return { supplier, detail, label: invoiceDescriptorLabel(supplier, detail) }
}
