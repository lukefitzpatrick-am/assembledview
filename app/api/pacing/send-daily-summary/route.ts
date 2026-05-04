import { NextRequest } from "next/server"
import axios from "axios"
import { assertCronSecret } from "@/lib/auth/assertCronSecret"
import { parseXanoListPayload, xanoUrl } from "@/lib/api/xano"
import { buildPacingSummaryPayload } from "@/lib/email/pacing-summary-payload"
import { sendPacingSummaryEmail } from "@/lib/email/sendPacingSummaryEmail"
import { getClientDisplayName } from "@/lib/clients/slug"
import {
  mergeClientsFilterForIdList,
  requirePacingAccess,
} from "@/lib/pacing/pacingAuth"
import { pacingJsonError, pacingJsonOk } from "@/lib/pacing/pacingHttp"
import { fetchLineItemPacingRows, fetchPacingAlerts } from "@/lib/pacing/pacingMart"
import { resolvePacingAlertRecipient } from "@/lib/pacing/resolvePacingAlertRecipient"
import { getUserRoles } from "@/lib/rbac"
import {
  PACING_ALERT_LOG_PATH,
  PACING_ALERT_SUBS_PATH,
  parsePacingList,
  xanoPacingGet,
  xanoPacingPost,
} from "@/lib/xano/pacingXanoApi"
import type { PacingAlertSubscription } from "@/lib/xano/pacing-types"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 300

function melbourneDateYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d)
  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value
  return `${y}-${m}-${day}`
}

function pacingPublicBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://assembledview.com.au"
  return raw.replace(/\/$/, "")
}

async function loadClientNameById(): Promise<Map<number, string>> {
  const m = new Map<number, string>()
  try {
    const { data } = await axios.get<unknown>(xanoUrl("get_clients", "XANO_CLIENTS_BASE_URL"), {
      timeout: 15_000,
    })
    const rows = parseXanoListPayload(data) as Record<string, unknown>[]
    for (const raw of rows) {
      const id = Number((raw as { id?: unknown }).id)
      if (!Number.isFinite(id)) continue
      m.set(id, getClientDisplayName(raw))
    }
  } catch {
    // keep empty map; payload still works with numeric fallbacks
  }
  return m
}

async function appendAlertLog(body: {
  subscription_id: number
  users_id: number
  alert_count: number
  status: "sent" | "error" | "skipped"
  error_message?: string | null
}): Promise<void> {
  await xanoPacingPost(PACING_ALERT_LOG_PATH, {
    subscription_id: body.subscription_id,
    users_id: body.users_id,
    sent_at: Date.now(),
    alert_count: body.alert_count,
    status: body.status,
    error_message: body.error_message ?? null,
  })
}

async function loadSubscriptionById(id: number): Promise<PacingAlertSubscription | null> {
  try {
    const raw = await xanoPacingGet(`${PACING_ALERT_SUBS_PATH}/${id}`)
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>
      if (o.data && typeof o.data === "object") return o.data as PacingAlertSubscription
    }
    return raw as PacingAlertSubscription
  } catch {
    return null
  }
}

type ProcessOutcome = "sent" | "skipped" | "error"

async function processSubscription(
  sub: PacingAlertSubscription,
  ctx: {
    clientNameById: Map<number, string>
    filterDateTo: string
    now: Date
  }
): Promise<{ outcome: ProcessOutcome; meta?: string }> {
  if (String(sub.channel ?? "email").toLowerCase() !== "email") {
    return { outcome: "skipped", meta: "channel_not_email" }
  }

  const recipient = await resolvePacingAlertRecipient(sub.users_id)
  if (!recipient) {
    await appendAlertLog({
      subscription_id: sub.id,
      users_id: sub.users_id,
      alert_count: 0,
      status: "error",
      error_message: "recipient_unresolved",
    })
    return { outcome: "error", meta: "recipient_unresolved" }
  }

  const subClientIds = sub.clients_ids?.length ? sub.clients_ids : null
  const clientFilter = mergeClientsFilterForIdList(subClientIds, recipient.allowedClientIds)
  if (clientFilter.mode === "none") {
    await appendAlertLog({
      subscription_id: sub.id,
      users_id: sub.users_id,
      alert_count: 0,
      status: "skipped",
      error_message: "no_client_scope",
    })
    return { outcome: "skipped", meta: "no_client_scope" }
  }

  const mediaTypes = sub.media_types?.length ? sub.media_types.map((x) => String(x).toLowerCase()) : null

  const alerts = await fetchPacingAlerts({
    clientFilter,
    minSeverity: sub.min_severity,
    mediaTypes,
    mediaType: null,
  })

  const lineItemsInScope = await fetchLineItemPacingRows({
    clientFilter,
    mediaTypes,
    mediaType: null,
    dateFrom: ctx.filterDateTo,
    dateTo: ctx.filterDateTo,
    search: null,
    mediaPlanId: null,
  })

  if (alerts.length === 0 && !sub.send_when_no_alerts) {
    await appendAlertLog({
      subscription_id: sub.id,
      users_id: sub.users_id,
      alert_count: 0,
      status: "skipped",
      error_message: null,
    })
    return { outcome: "skipped", meta: "no_alerts" }
  }

  const baseUrl = pacingPublicBaseUrl()
  const payload = buildPacingSummaryPayload(
    alerts,
    { email: recipient.email, first_name: recipient.first_name },
    sub,
    {
      lineItemsInScope,
      clientNameById: ctx.clientNameById,
      baseUrl,
      filterDateTo: ctx.filterDateTo,
      now: ctx.now,
    }
  )

  try {
    await sendPacingSummaryEmail(recipient.email, payload)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sendgrid_error"
    await appendAlertLog({
      subscription_id: sub.id,
      users_id: sub.users_id,
      alert_count: alerts.length,
      status: "error",
      error_message: msg,
    })
    return { outcome: "error", meta: msg }
  }

  await appendAlertLog({
    subscription_id: sub.id,
    users_id: sub.users_id,
    alert_count: alerts.length,
    status: "sent",
    error_message: null,
  })
  return { outcome: "sent" }
}

/** Vercel Cron invokes the path with **GET**; admin test runs use **POST**. */
export async function GET(request: NextRequest) {
  return POST(request)
}

export async function POST(request: NextRequest) {
  const url = request.nextUrl
  const isTest = url.searchParams.get("test") === "true"
  const singleIdRaw = url.searchParams.get("subscription_id")

  if (isTest && singleIdRaw) {
    const gate = await requirePacingAccess(request)
    if (!gate.ok) return gate.response
    const roles = getUserRoles(gate.session.user)
    if (!roles.includes("admin")) {
      return pacingJsonError("forbidden", 403, { reason: "admin_only_test" })
    }

    const id = Number.parseInt(singleIdRaw, 10)
    if (!Number.isFinite(id)) {
      return pacingJsonError("invalid subscription_id", 400)
    }

    const sub = await loadSubscriptionById(id)
    if (!sub) {
      return pacingJsonError("subscription_not_found", 404)
    }

    const clientNameById = await loadClientNameById()
    const now = new Date()
    const filterDateTo = melbourneDateYmd(now)
    const { outcome, meta } = await processSubscription(sub, { clientNameById, filterDateTo, now })

    return pacingJsonOk({
      processed: 1,
      sent: outcome === "sent" ? 1 : 0,
      skipped: outcome === "skipped" ? 1 : 0,
      errors: outcome === "error" ? 1 : 0,
      test: true,
      subscription_id: sub.id,
      outcome,
      meta: meta ?? null,
    })
  }

  if (!assertCronSecret(request)) {
    return pacingJsonError("unauthorised", 401, { hint: "cron_secret_required" })
  }

  try {
    const raw = await xanoPacingGet(PACING_ALERT_SUBS_PATH)
    const all = parsePacingList(raw) as PacingAlertSubscription[]
    const subs = all.filter((s) => s.is_active && String(s.channel ?? "email").toLowerCase() === "email")

    const clientNameById = await loadClientNameById()
    const now = new Date()
    const filterDateTo = melbourneDateYmd(now)

    let sent = 0
    let skipped = 0
    let errors = 0

    for (const sub of subs) {
      const { outcome } = await processSubscription(sub, { clientNameById, filterDateTo, now })
      if (outcome === "sent") sent++
      else if (outcome === "skipped") skipped++
      else errors++
    }

    return pacingJsonOk({
      processed: subs.length,
      sent,
      skipped,
      errors,
    })
  } catch (e) {
    console.error("[api/pacing/send-daily-summary]", e)
    return pacingJsonError(e instanceof Error ? e.message : "run_failed", 500)
  }
}
