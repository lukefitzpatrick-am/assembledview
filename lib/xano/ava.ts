import "server-only"

import { formatMoney as formatMoneyDisplay } from "@/lib/format/money"
import {
  fetchPlanMasterByMbaFromPostgres,
  fetchPlanVersionByMbaAndNumberFromPostgres,
  fetchPlanVersionsByMbaFromPostgres,
} from "@/lib/data/readMediaPlans"

function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str ? str : null
}

function parseLooseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" && Number.isFinite(value)) return value
  const str = String(value)
    .replace(/[, ]/g, "")
    .replace(/[^0-9.\-]/g, "")
    .trim()
  if (!str) return null
  const num = Number(str)
  return Number.isFinite(num) ? num : null
}

function formatMoney(value: number | null): string | null {
  if (value === null) return null
  try {
    return formatMoneyDisplay(value, { decimals: 0 })
  } catch {
    return String(value)
  }
}

function parseSchedule(raw: unknown): any[] | null {
  if (!raw) return null
  let parsed: any = raw
  if (typeof parsed === "string" && parsed.trim() !== "") {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }

  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).months)) {
    return (parsed as any).months
  }
  return null
}

function sumScheduleTotal(schedule: any[] | null): number | null {
  if (!schedule || schedule.length === 0) return null
  let total = 0
  let any = false
  for (const entry of schedule) {
    if (!entry || typeof entry !== "object") continue
    const candidate =
      parseLooseNumber((entry as any).totalAmount) ??
      parseLooseNumber((entry as any).total_amount) ??
      parseLooseNumber((entry as any).amount) ??
      parseLooseNumber((entry as any).totalMedia) ??
      parseLooseNumber((entry as any).total_media)
    if (candidate !== null) {
      total += candidate
      any = true
    }
  }
  return any ? total : null
}

const MEDIA_TOGGLE_LABELS: Record<string, string> = {
  mp_search: "Search",
  mp_socialmedia: "Social",
  mp_bvod: "BVOD",
  mp_progdisplay: "Programmatic Display",
  mp_progvideo: "Programmatic Video",
  mp_progbvod: "Programmatic BVOD",
  mp_progaudio: "Programmatic Audio",
  mp_progooh: "Programmatic OOH",
  mp_cinema: "Cinema",
  mp_digidisplay: "Digital Display",
  mp_digiaudio: "Digital Audio",
  mp_digivideo: "Digital Video",
  mp_television: "Television",
  mp_radio: "Radio",
  mp_ooh: "OOH",
  mp_newspaper: "Newspaper",
  mp_magazines: "Magazines",
  mp_integration: "Integration",
  mp_influencers: "Influencers",
  mp_production: "Production",
}

function detectEnabledMediaTypes(versionRow: any): string[] {
  if (!versionRow || typeof versionRow !== "object") return []
  const enabled: string[] = []
  for (const [key, label] of Object.entries(MEDIA_TOGGLE_LABELS)) {
    if ((versionRow as any)[key] === true) enabled.push(label)
  }
  return enabled
}

/**
 * Ava campaign summary from Postgres masters/versions (X8).
 * Prefer explicit versionNumber → master published version_number → tip max.
 */
export async function getAvaXanoSummary({
  clientSlug,
  mbaNumber,
  versionNumber,
}: {
  clientSlug?: string
  mbaNumber?: string
  versionNumber?: number
}): Promise<string> {
  const mba = safeString(mbaNumber)
  if (!mba) return ""

  const masterRow = await fetchPlanMasterByMbaFromPostgres(mba).catch(() => null)
  const masterVersionHint = parseLooseNumber(
    masterRow?.version_number ?? masterRow?.versionNumber ?? masterRow?.mp_plannumber
  )

  let resolvedVersion: number | null =
    typeof versionNumber === "number" && Number.isFinite(versionNumber)
      ? versionNumber
      : null

  if (resolvedVersion === null) {
    // Prefer published watermark on master (INVARIANTS); fall back to tip.
    if (masterVersionHint !== null) {
      resolvedVersion = masterVersionHint
    } else {
      const versions = await fetchPlanVersionsByMbaFromPostgres(mba).catch(() => [])
      let max: number | null = null
      for (const row of versions) {
        const v = parseLooseNumber(row?.version_number ?? row?.versionNumber)
        if (v === null) continue
        if (max === null || v > max) max = v
      }
      resolvedVersion = max
    }
  }

  let versionRow: Record<string, unknown> | null = null
  if (resolvedVersion !== null) {
    versionRow = await fetchPlanVersionByMbaAndNumberFromPostgres(
      mba,
      resolvedVersion
    ).catch(() => null)
  }

  if (!versionRow) {
    const versions = await fetchPlanVersionsByMbaFromPostgres(mba).catch(() => [])
    versionRow =
      versions
        .map((row) => ({
          row,
          v: parseLooseNumber(row?.version_number ?? row?.versionNumber) ?? -1,
        }))
        .sort((a, b) => b.v - a.v)[0]?.row ?? null
    if (versionRow && resolvedVersion === null) {
      resolvedVersion = parseLooseNumber(
        versionRow?.version_number ?? versionRow?.versionNumber
      )
    }
  }

  const campaignName =
    safeString(
      versionRow?.mp_campaignname ??
        versionRow?.campaignName ??
        versionRow?.campaign_name ??
        masterRow?.mp_campaignname ??
        masterRow?.campaign_name
    ) ?? null
  const startDate =
    safeString(
      versionRow?.mp_campaigndates_start ??
        versionRow?.campaignStart ??
        versionRow?.campaign_start_date ??
        masterRow?.mp_campaigndates_start ??
        masterRow?.campaign_start_date
    ) ?? null
  const endDate =
    safeString(
      versionRow?.mp_campaigndates_end ??
        versionRow?.campaignEnd ??
        versionRow?.campaign_end_date ??
        masterRow?.mp_campaigndates_end ??
        masterRow?.campaign_end_date
    ) ?? null
  const budget = parseLooseNumber(
    versionRow?.mp_campaignbudget ??
      versionRow?.campaignBudget ??
      versionRow?.campaign_budget ??
      masterRow?.mp_campaignbudget ??
      masterRow?.campaign_budget
  )

  const billingSchedule = parseSchedule(
    versionRow?.billingSchedule ??
      versionRow?.billing_schedule ??
      masterRow?.billingSchedule ??
      masterRow?.billing_schedule
  )
  const deliverySchedule = parseSchedule(
    versionRow?.deliverySchedule ??
      versionRow?.delivery_schedule ??
      masterRow?.deliverySchedule ??
      masterRow?.delivery_schedule
  )

  const billingTotal = sumScheduleTotal(billingSchedule)
  const deliveryTotal = sumScheduleTotal(deliverySchedule)
  const enabledMediaTypes = detectEnabledMediaTypes(versionRow)

  const lines: string[] = []
  lines.push(`MBA: ${mba}`)
  if (clientSlug) lines.push(`Client slug: ${clientSlug}`)
  if (resolvedVersion !== null) lines.push(`Latest version: ${resolvedVersion}`)
  if (campaignName) lines.push(`Campaign: ${campaignName}`)
  if (startDate || endDate) lines.push(`Dates: ${startDate ?? "?"} → ${endDate ?? "?"}`)
  if (budget !== null) lines.push(`Budget: ${formatMoney(budget) ?? budget}`)
  if (enabledMediaTypes.length) {
    lines.push(`Enabled media: ${enabledMediaTypes.join(", ")}`)
  }

  if (billingSchedule) {
    lines.push(
      `Billing schedule: ${billingSchedule.length} entries${
        billingTotal !== null ? `, total ${formatMoney(billingTotal)}` : ""
      }`
    )
  }
  if (deliverySchedule) {
    lines.push(
      `Delivery schedule: ${deliverySchedule.length} entries${
        deliveryTotal !== null ? `, total ${formatMoney(deliveryTotal)}` : ""
      }`
    )
  }

  let summary = lines.filter(Boolean).join("\n")
  if (summary.length > 2000) summary = `${summary.slice(0, 1997)}...`
  return summary
}
