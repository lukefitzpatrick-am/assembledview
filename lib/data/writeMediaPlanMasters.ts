/**
 * Postgres-authoritative media_plan_masters create (X9).
 * Order: sync identity seq → PG insert → best-effort Xano mirror with explicit id
 * (failure → app_notifications, never blocks / rolls back PG).
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { getXanoBaseUrl, getXanoTimeoutMs, xanoPostHeaderRecord } from "@/lib/api/xano"
import { mapPlanMasterFromPostgres } from "@/lib/data/readMediaPlans"
import { resolveClientIdForMaster } from "@/lib/data/writeClients"
import { dollarsToCampaignBudgetCents } from "@/lib/mediaplan/buildPostgresSavePayload"
import { mapCampaignStatusForPersist } from "@/lib/mediaplan/campaignStatusGuard"
import { toMelbourneDateString } from "@/lib/timezone"

export const MASTER_MIRROR_FAILURE_KIND = "xano_master_mirror_failed"
export const MASTER_MIRROR_FAILURE_AUDIENCE = "admin"

export type MasterMirrorFailurePayload = {
  op: "create"
  masterId: number
  mbaNumber: string
  error: string
  timestamp: string
  retried: boolean
}

export type MasterMirrorResult = "ok" | "failed"

export type CreateMediaPlanMasterInput = {
  mbaNumber: string
  mpClientName?: string | null
  campaignName?: string | null
  campaignStatus?: string | null
  campaignStartDate?: string | Date | null
  campaignEndDate?: string | Date | null
  /** Dollars (UI / legacy Xano field), converted to cents for PG. */
  campaignBudget?: number | string | null
  clientId?: number | null
}

export function buildMasterMirrorFailurePayload(input: {
  masterId: number
  mbaNumber: string
  error: string
  at?: Date
}): MasterMirrorFailurePayload {
  return {
    op: "create",
    masterId: input.masterId,
    mbaNumber: input.mbaNumber,
    error: input.error,
    timestamp: (input.at ?? new Date()).toISOString(),
    retried: false,
  }
}

/** Xano media_plan_master create body — explicit `id` so workspace stays aligned (~80% caveat). */
export function buildXanoMasterMirrorPayload(
  pgId: number,
  input: {
    mbaNumber: string
    mpClientName?: string | null
    campaignName?: string | null
    campaignStatus?: string | null
    campaignStartDate?: string | null
    campaignEndDate?: string | null
    campaignBudgetDollars?: number | null
  }
): Record<string, unknown> {
  return {
    id: pgId,
    mba_number: input.mbaNumber,
    mp_client_name: input.mpClientName ?? "",
    mp_campaignname: input.campaignName ?? "",
    version_number: 1,
    campaign_status: input.campaignStatus ?? "Draft",
    campaign_start_date: input.campaignStartDate ?? null,
    campaign_end_date: input.campaignEndDate ?? null,
    mp_campaignbudget: input.campaignBudgetDollars ?? 0,
  }
}

/**
 * After ETL explicit-id loads, identity can lag max(id). Advance the sequence
 * to cover MAX(id) when behind — never rewind when last_value is already ahead
 * (X9.1: setval(MAX) alone reissues ids that may still exist in Xano).
 */
export async function syncMediaPlanMastersIdSequence(): Promise<void> {
  const db = getDb()
  await db.execute(sql`
    SELECT setval(
      'media_plan_masters_id_seq',
      GREATEST(
        COALESCE((SELECT MAX(id)::bigint FROM media_plan_masters), 0),
        (SELECT last_value FROM media_plan_masters_id_seq)
      ),
      true
    )
  `)
}

export async function findExistingMasterByMbaNumberPostgres(
  mbaNumber: string
): Promise<{ id: number } | null> {
  const trimmed = mbaNumber.trim()
  if (!trimmed) return null
  const db = getDb()
  const [row] = await db
    .select({ id: schema.mediaPlanMasters.id })
    .from(schema.mediaPlanMasters)
    .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${trimmed.toLowerCase()}`)
    .limit(1)
  if (row?.id == null || !Number.isFinite(Number(row.id))) return null
  return { id: Number(row.id) }
}

export async function persistMasterMirrorFailureNotification(
  payload: MasterMirrorFailurePayload
): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) return
  try {
    const db = getDb()
    await db.execute(sql`
      INSERT INTO app_notifications (audience, kind, payload)
      VALUES (
        ${MASTER_MIRROR_FAILURE_AUDIENCE},
        ${MASTER_MIRROR_FAILURE_KIND},
        ${JSON.stringify(payload)}::jsonb
      )
    `)
  } catch (err) {
    console.warn("[masters-mirror] failed to persist app_notifications row", {
      masterId: payload.masterId,
      err,
    })
  }
}

async function mirrorMasterToXano(input: {
  masterId: number
  mbaNumber: string
  payload: Record<string, unknown>
}): Promise<MasterMirrorResult> {
  try {
    const baseUrl = getXanoBaseUrl([
      "XANO_MEDIA_PLANS_BASE_URL",
      "XANO_MEDIAPLANS_BASE_URL",
    ])
    const timeoutMs = getXanoTimeoutMs()
    const res = await fetch(`${baseUrl}/media_plan_master`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...xanoPostHeaderRecord(),
      },
      body: JSON.stringify(input.payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      throw new Error(
        `Xano POST media_plan_master ${res.status}: ${await res.text().catch(() => "")}`
      )
    }
    return "ok"
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[masters-mirror] Xano mirror failed", {
      masterId: input.masterId,
      mbaNumber: input.mbaNumber,
      message,
    })
    await persistMasterMirrorFailureNotification(
      buildMasterMirrorFailurePayload({
        masterId: input.masterId,
        mbaNumber: input.mbaNumber,
        error: message,
      })
    )
    return "failed"
  }
}

function dateToIsoDay(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null
  if (value instanceof Date) return toMelbourneDateString(value)
  const s = String(value).trim()
  if (!s) return null
  // Already YYYY-MM-DD or ISO — Melbourne helper accepts Date-parseable strings via Date.
  try {
    return toMelbourneDateString(new Date(s))
  } catch {
    return s.slice(0, 10)
  }
}

export type CreateMediaPlanMasterResult = {
  master: Record<string, unknown>
  mirror: MasterMirrorResult
}

/**
 * Insert media_plan_masters with a sequence-allocated id, then mirror to Xano
 * with the same explicit id (non-blocking on mirror failure).
 */
export async function createMediaPlanMasterPostgresFirst(
  input: CreateMediaPlanMasterInput
): Promise<CreateMediaPlanMasterResult> {
  const mbaNumber = String(input.mbaNumber ?? "").trim()
  if (!mbaNumber) {
    throw new Error("MBA number is required")
  }

  const mpClientName =
    typeof input.mpClientName === "string" && input.mpClientName.trim()
      ? input.mpClientName.trim()
      : null
  const campaignName =
    typeof input.campaignName === "string" && input.campaignName.trim()
      ? input.campaignName.trim()
      : null
  const statusRaw =
    typeof input.campaignStatus === "string" && input.campaignStatus.trim()
      ? input.campaignStatus.trim()
      : "Draft"
  const campaignStatus =
    mapCampaignStatusForPersist(statusRaw) ?? (statusRaw.toLowerCase() || "draft")
  const campaignStartDate = dateToIsoDay(input.campaignStartDate)
  const campaignEndDate = dateToIsoDay(input.campaignEndDate)
  const campaignBudgetCents = dollarsToCampaignBudgetCents(input.campaignBudget)
  const budgetDollars =
    campaignBudgetCents != null ? campaignBudgetCents / 100 : null

  // Sequence owns allocation on the hot path (X9.1). Post-ETL lag is fixed by
  // syncMediaPlanMastersIdSequence (no-rewind) at migration/ETL — not per insert.

  const clientId = await resolveClientIdForMaster({
    clientId: input.clientId ?? null,
    mpClientName,
  })

  const db = getDb()
  const [inserted] = await db
    .insert(schema.mediaPlanMasters)
    .values({
      mbaNumber,
      mpClientName,
      campaignName,
      campaignStatus,
      campaignStartDate,
      campaignEndDate,
      campaignBudgetCents,
      clientId,
    })
    .returning()

  if (!inserted?.id) {
    throw new Error("Postgres media_plan_masters insert returned no id")
  }

  const masterId = Number(inserted.id)
  const master = mapPlanMasterFromPostgres(
    inserted as unknown as Record<string, unknown>,
    null,
    1
  )
  // Create API historically returned version_number: 1 for brand-new masters.
  master.version_number = 1

  const mirrorPayload = buildXanoMasterMirrorPayload(masterId, {
    mbaNumber,
    mpClientName,
    campaignName,
    campaignStatus: statusRaw,
    campaignStartDate,
    campaignEndDate,
    campaignBudgetDollars: budgetDollars,
  })

  const mirror = await mirrorMasterToXano({
    masterId,
    mbaNumber,
    payload: mirrorPayload,
  })

  return { master, mirror }
}

/** Read-back helper for tests / ensureMaster logging. */
export async function masterExistsById(masterId: number): Promise<boolean> {
  const db = getDb()
  const [row] = await db
    .select({ id: schema.mediaPlanMasters.id })
    .from(schema.mediaPlanMasters)
    .where(eq(schema.mediaPlanMasters.id, masterId))
    .limit(1)
  return row != null
}
