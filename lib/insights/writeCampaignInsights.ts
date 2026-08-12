/**
 * Human authoring for campaign_insights (M9-4).
 * Never deletes. Edit-in-place only for own rows within EDIT_WINDOW_MS;
 * otherwise (or on explicit supersede) inserts a replacement and stamps
 * superseded_by + superseded_at together in one transaction.
 *
 * Cycle guard: when setting original.superseded_by = replacement, walk
 * replacement → superseded_by → … ; refuse if original appears (A→B→A).
 * DB CHECK only blocks self-supersede (id = superseded_by).
 */
import { and, eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"
import type { CampaignInsightType } from "@/db/schema/insights"
import type { CampaignInsightRow } from "@/lib/insights/queryCampaignInsights"

/** In-place edit window for the author's own insight. After this → supersede. */
export const INSIGHT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

export const INSIGHT_TYPES = [
  "delivery",
  "audience",
  "creative",
  "channel",
  "commercial",
] as const satisfies readonly CampaignInsightType[]

export type WriteInsightErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "ALREADY_SUPERSEDED"
  | "CYCLE"
  | "CONFLICT"

export class WriteInsightError extends Error {
  readonly code: WriteInsightErrorCode
  constructor(code: WriteInsightErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = "WriteInsightError"
  }
}

export type CreateInsightInput = {
  /** Required unless mbaNumber resolves a master row. */
  clientId?: number | null
  mbaNumber?: string | null
  body: string
  insightType: string
  period?: string | null
  createdBy: string
  /** When set, create the new row and supersede this id in the same txn. */
  supersedesId?: number | null
}

export type EditInsightInput = {
  id: number
  actorEmail: string
  body?: string
  insightType?: string
  period?: string | null
  /** Force supersede even inside the edit window. */
  forceSupersede?: boolean
}

const INSIGHT_SELECT = {
  id: schema.campaignInsights.id,
  mbaNumber: schema.campaignInsights.mbaNumber,
  clientId: schema.campaignInsights.clientId,
  period: schema.campaignInsights.period,
  insightType: schema.campaignInsights.insightType,
  body: schema.campaignInsights.body,
  source: schema.campaignInsights.source,
  confidence: schema.campaignInsights.confidence,
  createdBy: schema.campaignInsights.createdBy,
  createdAt: schema.campaignInsights.createdAt,
  supersededBy: schema.campaignInsights.supersededBy,
  supersededAt: schema.campaignInsights.supersededAt,
} as const

function mapRow(row: {
  id: number
  mbaNumber: string
  clientId: number
  period: string | null
  insightType: string
  body: string
  source: string
  confidence: string | null
  createdBy: string
  createdAt: string
  supersededBy: number | null
  supersededAt: string | null
}): CampaignInsightRow {
  return {
    id: Number(row.id),
    mbaNumber: row.mbaNumber,
    clientId: Number(row.clientId),
    period: row.period,
    insightType: row.insightType,
    body: row.body,
    source: row.source,
    confidence: row.confidence,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    supersededBy: row.supersededBy == null ? null : Number(row.supersededBy),
    supersededAt: row.supersededAt,
  }
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normaliseMba(mba: string | null | undefined): string {
  return String(mba ?? "").trim().toLowerCase()
}

function assertInsightType(raw: string): CampaignInsightType {
  const t = raw.trim()
  if (!(INSIGHT_TYPES as readonly string[]).includes(t)) {
    throw new WriteInsightError(
      "VALIDATION",
      `insight_type must be one of: ${INSIGHT_TYPES.join(", ")}`,
    )
  }
  return t as CampaignInsightType
}

function assertBody(body: string): string {
  const text = body.replace(/\s+/g, " ").trim()
  if (!text) throw new WriteInsightError("VALIDATION", "body is required")
  if (text.length > 4000) {
    throw new WriteInsightError("VALIDATION", "body must be ≤4000 characters")
  }
  return text
}

function assertPeriod(period: string | null | undefined): string | null {
  if (period == null || period.trim() === "") return null
  const p = period.trim()
  if (!/^\d{4}-\d{2}$/.test(p)) {
    throw new WriteInsightError("VALIDATION", "period must be YYYY-MM when set")
  }
  return p
}

/**
 * Walk replacement → superseded_by → … .
 * Returns true if `originalId` appears (creating original→replacement would cycle).
 */
export async function wouldCreateSupersedeCycle(
  originalId: number,
  replacementId: number,
  deps?: {
    getSupersededBy: (id: number) => Promise<number | null>
  },
): Promise<boolean> {
  if (originalId === replacementId) return true

  const getSupersededBy =
    deps?.getSupersededBy ??
    (async (id: number) => {
      const [row] = await getDb()
        .select({ supersededBy: schema.campaignInsights.supersededBy })
        .from(schema.campaignInsights)
        .where(eq(schema.campaignInsights.id, id))
        .limit(1)
      return row?.supersededBy == null ? null : Number(row.supersededBy)
    })

  const seen = new Set<number>()
  let cursor: number | null = replacementId
  while (cursor != null) {
    if (cursor === originalId) return true
    if (seen.has(cursor)) return true // corrupted loop already present
    seen.add(cursor)
    cursor = await getSupersededBy(cursor)
  }
  return false
}

function attributionConfidence(
  originalAuthor: string,
  actor: string,
): string | null {
  const was = normaliseEmail(originalAuthor)
  const by = normaliseEmail(actor)
  if (was === by) return null
  return `attributed_supersede:was:${was}`
}

async function getInsightById(id: number): Promise<CampaignInsightRow | null> {
  const [row] = await getDb()
    .select(INSIGHT_SELECT)
    .from(schema.campaignInsights)
    .where(eq(schema.campaignInsights.id, id))
    .limit(1)
  return row ? mapRow(row) : null
}

export function canEditInPlace(
  row: Pick<CampaignInsightRow, "createdBy" | "createdAt" | "supersededBy">,
  actorEmail: string,
  nowMs = Date.now(),
): boolean {
  if (row.supersededBy != null) return false
  if (normaliseEmail(row.createdBy) !== normaliseEmail(actorEmail)) return false
  const created = Date.parse(row.createdAt)
  if (!Number.isFinite(created)) return false
  return nowMs - created <= INSIGHT_EDIT_WINDOW_MS
}

async function resolveClientIdFromMba(mbaNumber: string): Promise<number | null> {
  const mba = normaliseMba(mbaNumber)
  if (!mba) return null
  const [row] = await getDb()
    .select({ clientId: schema.mediaPlanMasters.clientId })
    .from(schema.mediaPlanMasters)
    .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${mba}`)
    .limit(1)
  const id = row?.clientId
  return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : null
}

/**
 * Insert a human insight. Optional supersedesId stamps the original in the same txn.
 */
export async function createCampaignInsight(
  input: CreateInsightInput,
): Promise<CampaignInsightRow> {
  const createdBy = normaliseEmail(input.createdBy)
  if (!createdBy) throw new WriteInsightError("VALIDATION", "createdBy is required")
  const body = assertBody(input.body)
  const insightType = assertInsightType(input.insightType)
  const period = assertPeriod(input.period)
  const mbaNumber = normaliseMba(input.mbaNumber)
  const supersedesId =
    typeof input.supersedesId === "number" && Number.isFinite(input.supersedesId)
      ? Math.floor(input.supersedesId)
      : null

  let clientId =
    typeof input.clientId === "number" && Number.isFinite(input.clientId) && input.clientId > 0
      ? Math.floor(input.clientId)
      : null
  if (clientId == null && mbaNumber) {
    clientId = await resolveClientIdFromMba(mbaNumber)
  }
  if (clientId == null) {
    throw new WriteInsightError(
      "VALIDATION",
      "clientId is required (or provide mbaNumber that resolves a media plan master)",
    )
  }

  if (supersedesId != null) {
    const original = await getInsightById(supersedesId)
    if (!original) throw new WriteInsightError("NOT_FOUND", "Insight to supersede not found")
    if (original.supersededBy != null) {
      throw new WriteInsightError("ALREADY_SUPERSEDED", "Insight is already superseded")
    }
    if (original.clientId !== clientId) {
      throw new WriteInsightError(
        "VALIDATION",
        "Replacement must stay on the same client as the original",
      )
    }
  }

  const db = getDb()
  return await db.transaction(async (tx) => {
    let confidence: string | null = null
    if (supersedesId != null) {
      const [orig] = await tx
        .select(INSIGHT_SELECT)
        .from(schema.campaignInsights)
        .where(eq(schema.campaignInsights.id, supersedesId))
        .limit(1)
      if (!orig) throw new WriteInsightError("NOT_FOUND", "Insight to supersede not found")
      confidence = attributionConfidence(orig.createdBy, createdBy)
    }

    const [inserted] = await tx
      .insert(schema.campaignInsights)
      .values({
        mbaNumber,
        clientId,
        period,
        insightType,
        body,
        source: "human",
        confidence,
        createdBy,
      })
      .returning(INSIGHT_SELECT)

    if (!inserted) throw new WriteInsightError("CONFLICT", "Insert returned no row")
    const replacement = mapRow(inserted)

    if (supersedesId != null) {
      const cycles = await wouldCreateSupersedeCycle(supersedesId, replacement.id, {
        getSupersededBy: async (id) => {
          const [r] = await tx
            .select({ supersededBy: schema.campaignInsights.supersededBy })
            .from(schema.campaignInsights)
            .where(eq(schema.campaignInsights.id, id))
            .limit(1)
          return r?.supersededBy == null ? null : Number(r.supersededBy)
        },
      })
      if (cycles) {
        throw new WriteInsightError("CYCLE", "Supersede would create a cycle")
      }

      const now = sql`now()`
      const updated = await tx
        .update(schema.campaignInsights)
        .set({
          supersededBy: replacement.id,
          supersededAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.campaignInsights.id, supersedesId),
            sql`${schema.campaignInsights.supersededBy} IS NULL`,
          ),
        )
        .returning({ id: schema.campaignInsights.id })

      if (updated.length === 0) {
        throw new WriteInsightError("ALREADY_SUPERSEDED", "Insight is already superseded")
      }
    }

    return replacement
  })
}

/**
 * Edit own insight in-place inside the window; otherwise supersede with a new row.
 */
export async function editCampaignInsight(
  input: EditInsightInput,
): Promise<{ row: CampaignInsightRow; mode: "edit" | "supersede" }> {
  const actor = normaliseEmail(input.actorEmail)
  if (!actor) throw new WriteInsightError("VALIDATION", "actor email is required")

  const existing = await getInsightById(input.id)
  if (!existing) throw new WriteInsightError("NOT_FOUND", "Insight not found")
  if (existing.supersededBy != null) {
    throw new WriteInsightError("ALREADY_SUPERSEDED", "Cannot edit a superseded insight")
  }

  const body = input.body != null ? assertBody(input.body) : existing.body
  const insightType =
    input.insightType != null
      ? assertInsightType(input.insightType)
      : (existing.insightType as CampaignInsightType)
  const period =
    input.period !== undefined ? assertPeriod(input.period) : existing.period

  const inPlace =
    !input.forceSupersede && canEditInPlace(existing, actor)

  if (inPlace) {
    const [updated] = await getDb()
      .update(schema.campaignInsights)
      .set({
        body,
        insightType,
        period,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.campaignInsights.id, existing.id),
          sql`${schema.campaignInsights.supersededBy} IS NULL`,
        ),
      )
      .returning(INSIGHT_SELECT)
    if (!updated) {
      throw new WriteInsightError("ALREADY_SUPERSEDED", "Insight is already superseded")
    }
    return { row: mapRow(updated), mode: "edit" }
  }

  // Outside window, force, or not owner — supersede (attribute foreign authors).
  const replacement = await createCampaignInsight({
    clientId: existing.clientId,
    mbaNumber: existing.mbaNumber,
    body,
    insightType,
    period,
    createdBy: actor,
    supersedesId: existing.id,
  })
  return { row: replacement, mode: "supersede" }
}
