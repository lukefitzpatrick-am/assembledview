/**
 * Build {@link MBAData} for lib/generateMBA from a persisted media_plan_versions row
 * (+ optional client address + fee snapshot). Money comes only from persisted schedules
 * via {@link computeCampaignFinancialsFromVersion}.
 */

import { format } from "date-fns"
import type { BillingMonth } from "@/lib/billing/types"
import { parseMoneyInput } from "@/lib/format/money"
import { addGst } from "@/lib/finance/gst"
import { computeCampaignFinancialsFromVersion } from "@/lib/finance/computeCampaignFinancialsFromVersion"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"
import { getBillingSchedule } from "@/lib/finance/normalizeFields"
import { getAttachedRowsChecksum } from "@/lib/finance/rows/attachPlanRowSchedules"
import { shouldReadPlanRows } from "@/lib/finance/rows/readFlags"
import { snapshotChecksum, snapshotChecksumShort } from "@/lib/finance/snapshotChecksum"
import type { MBAData } from "@/lib/generateMBA"
import { toMelbourneDateString } from "@/lib/timezone"

/** Form flag → schedule mediaCosts key → MBA table label (matches edit-page mediaTypes). */
export const MBA_GROSS_MEDIA_CHANNELS: ReadonlyArray<{
  flag: string
  scheduleKey: keyof BillingMonth["mediaCosts"]
  label: string
}> = [
  { flag: "mp_television", scheduleKey: "television", label: "Television" },
  { flag: "mp_radio", scheduleKey: "radio", label: "Radio" },
  { flag: "mp_newspaper", scheduleKey: "newspaper", label: "Newspaper" },
  { flag: "mp_magazines", scheduleKey: "magazines", label: "Magazines" },
  { flag: "mp_ooh", scheduleKey: "ooh", label: "OOH" },
  { flag: "mp_cinema", scheduleKey: "cinema", label: "Cinema" },
  { flag: "mp_digidisplay", scheduleKey: "digiDisplay", label: "Digital Display" },
  { flag: "mp_digiaudio", scheduleKey: "digiAudio", label: "Digital Audio" },
  { flag: "mp_digivideo", scheduleKey: "digiVideo", label: "Digital Video" },
  { flag: "mp_bvod", scheduleKey: "bvod", label: "BVOD" },
  { flag: "mp_integration", scheduleKey: "integration", label: "Integration" },
  { flag: "mp_search", scheduleKey: "search", label: "Search" },
  { flag: "mp_socialmedia", scheduleKey: "socialMedia", label: "Social Media" },
  { flag: "mp_progdisplay", scheduleKey: "progDisplay", label: "Programmatic Display" },
  { flag: "mp_progvideo", scheduleKey: "progVideo", label: "Programmatic Video" },
  { flag: "mp_progbvod", scheduleKey: "progBvod", label: "Programmatic BVOD" },
  { flag: "mp_progaudio", scheduleKey: "progAudio", label: "Programmatic Audio" },
  { flag: "mp_progooh", scheduleKey: "progOoh", label: "Programmatic OOH" },
  { flag: "mp_influencers", scheduleKey: "influencers", label: "Influencers" },
]

function isTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value === "string") {
    const s = value.trim().toLowerCase()
    return s === "true" || s === "1" || s === "yes"
  }
  return false
}

function parseScheduleMoney(value: string | undefined): number {
  return parseMoneyInput(value ?? 0) ?? 0
}

function formatPdfDate(raw: unknown): string {
  if (raw == null || raw === "") return ""
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return ""
    return format(raw, "dd/MM/yyyy")
  }
  if (typeof raw === "number" || typeof raw === "string") {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy")
    const mel = toMelbourneDateString(raw)
    if (mel) {
      const [y, m, day] = mel.split("-")
      if (y && m && day) return `${day}/${m}/${y}`
    }
    return String(raw)
  }
  return ""
}

function sumMediaCostsByChannel(months: BillingMonth[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const month of months) {
    const costs = month.mediaCosts
    if (!costs) continue
    for (const [key, raw] of Object.entries(costs)) {
      if (key === "production") continue
      out[key] = (out[key] ?? 0) + parseScheduleMoney(raw)
    }
  }
  return out
}

export type ClientAddressFields = {
  streetaddress?: string | null
  suburb?: string | null
  state?: string | null
  postcode?: string | null
}

export type BuildMbaDataFromPersistedVersionResult = {
  mbaData: MBAData
  checksum: string
  checksumShort: string
  versionNumber: number | string
}

/**
 * @throws Error when schedules cannot produce financials
 */
export function buildMbaDataFromPersistedVersion(args: {
  version: Record<string, unknown>
  mbaNumber: string
  clientAddress?: ClientAddressFields | null
  feeLoading?: FeeLoading | null
  /** Override "today" for deterministic tests. */
  asOfDate?: Date
}): BuildMbaDataFromPersistedVersionResult {
  const { version, mbaNumber, clientAddress, feeLoading, asOfDate } = args

  const financials = computeCampaignFinancialsFromVersion(
    version,
    feeLoading ? { feeLoading } : undefined
  )
  if (!financials) {
    throw new Error(
      "Persisted version has no usable billing/delivery schedule to build MBA totals"
    )
  }

  const versionNumberRaw =
    version.version_number ?? version.mp_plannumber ?? version.version ?? ""
  const versionNumber =
    typeof versionNumberRaw === "number" || typeof versionNumberRaw === "string"
      ? versionNumberRaw
      : String(versionNumberRaw)

  const delivery =
    financials.deliverySchedule.length > 0
      ? financials.deliverySchedule
      : financials.billingSchedule
  const mediaByKey = sumMediaCostsByChannel(delivery)

  // Prefer enabled channel flags on the version (same as editor form filters).
  // If no flags are set, include any channel with non-zero media.
  const anyFlag = MBA_GROSS_MEDIA_CHANNELS.some((c) => isTruthyFlag(version[c.flag]))
  const gross_media = MBA_GROSS_MEDIA_CHANNELS.filter((c) =>
    anyFlag ? isTruthyFlag(version[c.flag]) : (mediaByKey[c.scheduleKey] ?? 0) > 0
  ).map((c) => ({
    media_type: c.label,
    gross_amount: mediaByKey[c.scheduleKey] ?? 0,
  }))

  const t = financials.mbaScopeTotals
  const billingSchedule = financials.billingSchedule.map((m) => ({
    monthYear: m.monthYear,
    totalAmount: m.totalAmount,
  }))

  // Plan C S2-P5 docs: when reading rows, footer matches stored snapshot_checksum.
  const attachedChecksum = getAttachedRowsChecksum(version)
  const storedChecksum =
    typeof version.snapshot_checksum === "string" && version.snapshot_checksum.length > 0
      ? version.snapshot_checksum
      : typeof version.snapshotChecksum === "string" && version.snapshotChecksum.length > 0
        ? version.snapshotChecksum
        : null
  const preferStored = Boolean(attachedChecksum) || shouldReadPlanRows("docs", version)
  const checksumSource = getBillingSchedule(version) ?? financials.billingSchedule
  const checksum =
    preferStored && (attachedChecksum || storedChecksum)
      ? (attachedChecksum ?? storedChecksum)!
      : snapshotChecksum(checksumSource)
  const checksumShort =
    preferStored && (attachedChecksum || storedChecksum)
      ? checksum.slice(0, 8)
      : snapshotChecksumShort(checksumSource)

  const clientName = String(
    version.mp_client_name ?? version.client_name ?? version.mp_clientname ?? ""
  )

  const mbaData: MBAData = {
    date: format(asOfDate ?? new Date(), "dd/MM/yyyy"),
    mba_number: mbaNumber,
    campaign_name: String(version.campaign_name ?? version.mp_campaignname ?? ""),
    campaign_brand: String(version.brand ?? version.mp_brand ?? ""),
    po_number: String(version.po_number ?? version.mp_ponumber ?? ""),
    media_plan_version: String(versionNumber),
    client: {
      name: clientName,
      streetaddress: String(clientAddress?.streetaddress ?? ""),
      suburb: String(clientAddress?.suburb ?? ""),
      state: String(clientAddress?.state ?? ""),
      postcode: String(clientAddress?.postcode ?? ""),
    },
    campaign: {
      date_start: formatPdfDate(
        version.campaign_start_date ?? version.mp_campaigndates_start
      ),
      date_end: formatPdfDate(
        version.campaign_end_date ?? version.mp_campaigndates_end
      ),
    },
    gross_media,
    totals: {
      gross_media: t.grossMedia,
      service_fee: t.fee,
      production: t.production,
      adserving: t.adServing,
      totals_ex_gst: t.nettExGst,
      total_inc_gst: t.nettIncGst ?? addGst(t.nettExGst),
    },
    billingSchedule,
    documentStamp: `v${versionNumber} · ${checksumShort}`,
  }

  return { mbaData, checksum, checksumShort, versionNumber }
}
