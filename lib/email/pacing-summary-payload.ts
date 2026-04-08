import { computeLineItemPacingDerived } from "@/components/pacing/pacingMetrics"
import { formatPacingAud } from "@/components/pacing/formatters"
import type { PacingAlert, PacingAlertSubscription, LineItemPacingRow } from "@/lib/xano/pacing-types"
import { slugifyClientNameForUrl } from "@/lib/clients/slug"

/** Minimal user shape for the daily summary (avoid coupling to Auth0 session types). */
export type PacingSummaryUser = {
  email: string
  first_name: string | null
}

export type PacingSummaryLineItemRow = {
  label: string
  media_type: string
  status: string
  severity: string
  variance_pct_label: string
  budget_label: string
  spend_to_date_label: string
  required_daily_label: string
  deep_link: string
}

export type PacingSummaryClientBlock = {
  client_name: string
  line_items: PacingSummaryLineItemRow[]
}

export type PacingSummaryPayload = {
  user_first_name: string
  date_label: string
  total_active_line_items: number
  status_counts: {
    on_track: number
    slightly_under: number
    slightly_over: number
    under_pacing: number
    over_pacing: number
    no_delivery: number
  }
  critical_count: number
  warning_count: number
  clients: PacingSummaryClientBlock[]
  manage_url: string
  unsubscribe_url: string
}

const SUMMARY_STATUSES = [
  "on_track",
  "slightly_under",
  "slightly_over",
  "under_pacing",
  "over_pacing",
  "no_delivery",
] as const

function severityRank(s: string): number {
  const x = s.toLowerCase()
  if (x === "critical") return 0
  if (x === "warning") return 1
  return 2
}

function formatVarianceLabel(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—"
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

function melbourneDateLongLabel(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPart["type"]) => parts.find((p) => p.type === t)?.value ?? ""
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`.replace(/\s+/g, " ").trim()
}

function consolidateAlerts(alerts: PacingAlert[]): PacingAlert[] {
  const map = new Map<string, PacingAlert>()
  for (const a of alerts) {
    const cid = Number(a.clients_id)
    const lid = String(a.av_line_item_id ?? "")
    if (!Number.isFinite(cid) || !lid) continue
    const key = `${cid}:${lid}`
    const prev = map.get(key)
    if (!prev || severityRank(String(a.severity)) < severityRank(String(prev.severity))) {
      map.set(key, a)
    }
  }
  return [...map.values()]
}

/**
 * Build SendGrid dynamic template data for the pacing digest.
 * @param filterDateTo — `yyyy-MM-dd` pacing “as of” date (use Melbourne “today” for dailies).
 */
export function buildPacingSummaryPayload(
  alerts: PacingAlert[],
  user: PacingSummaryUser,
  _subscription: PacingAlertSubscription,
  opts: {
    lineItemsInScope: LineItemPacingRow[]
    clientNameById: Map<number, string>
    baseUrl: string
    filterDateTo: string
    now?: Date
  }
): PacingSummaryPayload {
  const now = opts.now ?? new Date()
  const baseUrl = opts.baseUrl.replace(/\/$/, "")
  const lineById = new Map<string, LineItemPacingRow>()
  for (const row of opts.lineItemsInScope) {
    lineById.set(String(row.av_line_item_id), row)
  }

  const status_counts: PacingSummaryPayload["status_counts"] = {
    on_track: 0,
    slightly_under: 0,
    slightly_over: 0,
    under_pacing: 0,
    over_pacing: 0,
    no_delivery: 0,
  }
  const statusKeys = new Set<string>(SUMMARY_STATUSES)
  for (const row of opts.lineItemsInScope) {
    const s = String(row.pacing_status ?? "").toLowerCase()
    if (statusKeys.has(s)) {
      status_counts[s as keyof typeof status_counts] += 1
    }
  }

  const consolidated = consolidateAlerts(alerts)
  const critical_count = consolidated.filter((a) => String(a.severity).toLowerCase() === "critical").length
  const warning_count = consolidated.filter((a) => String(a.severity).toLowerCase() === "warning").length
  const byClient = new Map<number, PacingAlert[]>()
  for (const a of consolidated) {
    const cid = Number(a.clients_id)
    if (!Number.isFinite(cid)) continue
    const arr = byClient.get(cid) ?? []
    arr.push(a)
    byClient.set(cid, arr)
  }

  const clientIds = [...byClient.keys()].sort((a, b) => {
    const na = opts.clientNameById.get(a) ?? String(a)
    const nb = opts.clientNameById.get(b) ?? String(b)
    return na.localeCompare(nb, "en")
  })

  const clients: PacingSummaryClientBlock[] = []

  for (const cid of clientIds) {
    const group = byClient.get(cid) ?? []
    const clientName = opts.clientNameById.get(cid) ?? `Client ${cid}`
    const slug = slugifyClientNameForUrl(clientName) || String(cid)

    const line_items: PacingSummaryLineItemRow[] = group
      .map((alert) => {
        const lid = String(alert.av_line_item_id ?? "")
        const line = lineById.get(lid)
        const derived = line ? computeLineItemPacingDerived(line, opts.filterDateTo) : null
        const label =
          line?.av_line_item_label?.trim() ||
          alert.alert_message?.slice(0, 120) ||
          lid ||
          "Line item"
        const media_type = String(alert.media_type ?? line?.media_type ?? "—")
        const status = String(alert.pacing_status ?? line?.pacing_status ?? "—")
        const severity = String(alert.severity ?? "info")
        const variance_pct_label = formatVarianceLabel(derived?.variancePct ?? null)
        const budget_label = formatPacingAud(line?.budget_amount ?? derived?.budget ?? null)
        const spend_to_date_label = formatPacingAud(line?.spend_amount ?? derived?.spend ?? null)
        const req = derived?.requiredDaily ?? 0
        const required_daily_label =
          req > 0 ? `${formatPacingAud(req)}/day` : "—"
        const deep_link = `${baseUrl}/pacing/${encodeURIComponent(slug)}/line-item/${encodeURIComponent(lid)}`

        return {
          row: {
            label,
            media_type,
            status,
            severity,
            variance_pct_label,
            budget_label,
            spend_to_date_label,
            required_daily_label,
            deep_link,
          },
          _sortSev: severityRank(severity),
          _sortVar: Math.abs(derived?.variancePct ?? 0),
        }
      })
      .sort((a, b) => {
        if (a._sortSev !== b._sortSev) return a._sortSev - b._sortSev
        return b._sortVar - a._sortVar
      })
      .map((x) => x.row)

    clients.push({ client_name: clientName, line_items })
  }

  return {
    user_first_name: user.first_name?.trim() || "there",
    date_label: melbourneDateLongLabel(now),
    total_active_line_items: opts.lineItemsInScope.length,
    status_counts,
    critical_count,
    warning_count,
    clients,
    manage_url: `${baseUrl}/pacing/settings`,
    unsubscribe_url: `${baseUrl}/pacing/settings#alert-subscriptions`,
  }
}

export { SUMMARY_STATUSES, melbourneDateLongLabel }
