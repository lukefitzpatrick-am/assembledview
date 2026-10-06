/**
 * Postgres-authoritative media_plan_masters create.
 * The Postgres insert is the whole function. Sequence allocation stays on Postgres.
 */
import "server-only"

import { eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import { mapPlanMasterFromPostgres } from "@/lib/data/readMediaPlans"
import { resolveClientIdForMaster } from "@/lib/data/writeClients"
import { dollarsToCampaignBudgetCents } from "@/lib/mediaplan/buildPostgresSavePayload"
import { mapCampaignStatusForPersist } from "@/lib/mediaplan/campaignStatusGuard"
import { toMelbourneDateString } from "@/lib/timezone"

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

/**
 * After ETL explicit-id loads, identity can lag max(id). Advance the sequence
 * to cover MAX(id) when behind — never rewind when last_value is already ahead.
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
}

/**
 * Insert media_plan_masters with a sequence-allocated id.
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

  const master = mapPlanMasterFromPostgres(
    inserted as unknown as Record<string, unknown>,
    null,
    1
  )
  // Create API historically returned version_number: 1 for brand-new masters.
  master.version_number = 1

  return { master }
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
