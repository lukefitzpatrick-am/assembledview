import "server-only"

import { xanoPostHeaderRecord, xanoUrl } from "@/lib/api/xano"

const MEDIA_PLANS_BASE_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const

function getAuthHeaders() {
  return xanoPostHeaderRecord()
}

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
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(
      value
    )
  } catch {
    return String(value)
  }
}

async function fetchJson(url: string) {
  const res = await fetch(url, { method: "GET", headers: getAuthHeaders(), cache: "no-store" })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Xano request failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

function pickRowByMbaNumber(rows: any, mbaNumber: string): any | null {
  if (!rows) return null
  const requested = String(mbaNumber ?? "").trim().toLowerCase()

  const list = Array.isArray(rows) ? rows : [rows]
  for (const row of list) {
    const rowMba = String(row?.mba_number ?? row?.mbaNumber ?? "").trim().toLowerCase()
    if (rowMba && rowMba === requested) return row
  }
  return list[0] ?? null
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
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).months)) return (parsed as any).months
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

function unwrapVersionRows(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === "object" && Array.isArray((raw as any).items)) return (raw as any).items
  if (raw && typeof raw === "object") return [raw]
  return []
}

/** Highest version_number for an MBA via media_plan_versions (paged). */
async function fetchMaxVersionNumberForMba(mba: string): Promise<number | null> {
  const versionsUrl = new URL(xanoUrl("media_plan_versions", MEDIA_PLANS_BASE_KEYS as any))
  versionsUrl.searchParams.set("mba_number", mba)
  versionsUrl.searchParams.set("page", "1")
  versionsUrl.searchParams.set("per_page", "100")
  const versionsRaw = await fetchJson(versionsUrl.toString()).catch(() => null)
  const rows = unwrapVersionRows(versionsRaw)
  let max: number | null = null
  for (const row of rows) {
    const v = parseLooseNumber(row?.version_number ?? row?.versionNumber)
    if (v === null) continue
    if (max === null || v > max) max = v
  }
  return max
}

async function fetchVersionRow(opts: {
  mba: string
  masterId: unknown
  versionNumber: string | number
}): Promise<any | null> {
  if (opts.masterId != null) {
    const versionUrl = new URL(xanoUrl("media_plan_versions", MEDIA_PLANS_BASE_KEYS as any))
    versionUrl.searchParams.set("media_plan_master_id", String(opts.masterId))
    versionUrl.searchParams.set("version_number", String(opts.versionNumber))
    versionUrl.searchParams.set("page", "1")
    versionUrl.searchParams.set("per_page", "50")
    const versionRaw = await fetchJson(versionUrl.toString()).catch(() => null)
    const rows = unwrapVersionRows(versionRaw)
    if (rows[0]) return rows[0]
  }

  const versionsUrl = new URL(xanoUrl("media_plan_versions", MEDIA_PLANS_BASE_KEYS as any))
  versionsUrl.searchParams.set("mba_number", opts.mba)
  versionsUrl.searchParams.set("version_number", String(opts.versionNumber))
  versionsUrl.searchParams.set("page", "1")
  versionsUrl.searchParams.set("per_page", "50")
  const byMba = await fetchJson(versionsUrl.toString()).catch(() => null)
  return unwrapVersionRows(byMba)[0] ?? null
}

export async function getAvaXanoSummary({
  clientSlug,
  mbaNumber,
  versionNumber,
}: {
  clientSlug?: string
  mbaNumber?: string
  /** Prefer page-context version when present; never trust master alone. */
  versionNumber?: number
}): Promise<string> {
  const mba = safeString(mbaNumber)
  if (!mba) return ""

  // 1) Master record (campaign metadata + optional fast-path version hint)
  const masterUrl = new URL(xanoUrl("media_plan_master", MEDIA_PLANS_BASE_KEYS as any))
  masterUrl.searchParams.set("mba_number", mba)
  const masterRaw = await fetchJson(masterUrl.toString()).catch(() => null)
  const masterRow = pickRowByMbaNumber(masterRaw, mba)

  const masterId = masterRow?.id
  const masterVersionHint =
    parseLooseNumber(masterRow?.version_number ?? masterRow?.versionNumber ?? masterRow?.mp_plannumber)

  // 2) Resolve version: explicit arg → max(media_plan_versions) → master hint
  let resolvedVersion: number | null =
    typeof versionNumber === "number" && Number.isFinite(versionNumber) ? versionNumber : null

  if (resolvedVersion === null) {
    const maxFromVersions = await fetchMaxVersionNumberForMba(mba)
    // Master is a fast path only when it agrees with max(versions); otherwise prefer max.
    if (maxFromVersions !== null) {
      if (masterVersionHint !== null && masterVersionHint !== maxFromVersions) {
        console.info("[getAvaXanoSummary] master.version_number lags max(versions)", {
          mba,
          masterVersion: masterVersionHint,
          maxVersion: maxFromVersions,
        })
      }
      resolvedVersion = maxFromVersions
    } else {
      resolvedVersion = masterVersionHint
    }
  }

  let versionRow: any | null = null
  if (resolvedVersion !== null) {
    versionRow = await fetchVersionRow({
      mba,
      masterId,
      versionNumber: resolvedVersion,
    })
  }

  if (!versionRow) {
    // Last resort: highest version row for the MBA
    const versionsUrl = new URL(xanoUrl("media_plan_versions", MEDIA_PLANS_BASE_KEYS as any))
    versionsUrl.searchParams.set("mba_number", mba)
    versionsUrl.searchParams.set("page", "1")
    versionsUrl.searchParams.set("per_page", "100")
    const versionsRaw = await fetchJson(versionsUrl.toString()).catch(() => null)
    const rows = unwrapVersionRows(versionsRaw)
    versionRow =
      rows
        .map((row) => ({ row, v: parseLooseNumber(row?.version_number ?? row?.versionNumber) ?? -1 }))
        .sort((a, b) => b.v - a.v)[0]?.row ?? null
    if (versionRow && resolvedVersion === null) {
      resolvedVersion = parseLooseNumber(versionRow?.version_number ?? versionRow?.versionNumber)
    }
  }

  const campaignName =
    safeString(versionRow?.mp_campaignname ?? versionRow?.campaignName ?? masterRow?.mp_campaignname) ?? null
  const startDate =
    safeString(versionRow?.mp_campaigndates_start ?? versionRow?.campaignStart ?? masterRow?.mp_campaigndates_start) ??
    null
  const endDate =
    safeString(versionRow?.mp_campaigndates_end ?? versionRow?.campaignEnd ?? masterRow?.mp_campaigndates_end) ?? null
  const budget = parseLooseNumber(versionRow?.mp_campaignbudget ?? versionRow?.campaignBudget ?? masterRow?.mp_campaignbudget)

  const billingSchedule = parseSchedule(
    versionRow?.billingSchedule ?? versionRow?.billing_schedule ?? masterRow?.billingSchedule ?? masterRow?.billing_schedule
  )
  const deliverySchedule = parseSchedule(
    versionRow?.deliverySchedule ?? versionRow?.delivery_schedule ?? masterRow?.deliverySchedule ?? masterRow?.delivery_schedule
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
  if (enabledMediaTypes.length) lines.push(`Enabled media: ${enabledMediaTypes.join(", ")}`)

  if (billingSchedule) {
    lines.push(
      `Billing schedule: ${billingSchedule.length} entries${billingTotal !== null ? `, total ${formatMoney(billingTotal)}` : ""}`
    )
  }
  if (deliverySchedule) {
    lines.push(
      `Delivery schedule: ${deliverySchedule.length} entries${deliveryTotal !== null ? `, total ${formatMoney(deliveryTotal)}` : ""}`
    )
  }

  let summary = lines.filter(Boolean).join("\n")
  if (summary.length > 2000) summary = `${summary.slice(0, 1997)}...`
  return summary
}
