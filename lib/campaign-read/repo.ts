import { and, desc, eq, lt, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"

import { emptyCampaignReadBeats, parseCampaignReadBeats, renderCampaignReadMarkdown } from "./beats"
import { GENERATING_STALE_ERROR, GENERATING_STALE_MS } from "./stale"
import type {
  CampaignRead,
  CampaignReadBeats,
  CampaignReadListPayload,
  CampaignReadStatus,
} from "./types"

export class CampaignReadError extends Error {
  readonly code: "NOT_FOUND" | "VALIDATION" | "UNAVAILABLE"
  constructor(code: CampaignReadError["code"], message: string) {
    super(message)
    this.code = code
    this.name = "CampaignReadError"
  }
}

const SELECT = {
  id: schema.campaignReads.id,
  mbaNumber: schema.campaignReads.mbaNumber,
  versionNumber: schema.campaignReads.versionNumber,
  status: schema.campaignReads.status,
  beats: schema.campaignReads.beats,
  bodyMarkdown: schema.campaignReads.bodyMarkdown,
  sources: schema.campaignReads.sources,
  generatedAt: schema.campaignReads.generatedAt,
  generatedByEmail: schema.campaignReads.generatedByEmail,
  editedAt: schema.campaignReads.editedAt,
  editedByEmail: schema.campaignReads.editedByEmail,
  publishedAt: schema.campaignReads.publishedAt,
  publishedByEmail: schema.campaignReads.publishedByEmail,
  errorMessage: schema.campaignReads.errorMessage,
} as const

function asStatus(value: string): CampaignReadStatus {
  if (
    value === "published" ||
    value === "generating" ||
    value === "failed" ||
    value === "draft"
  ) {
    return value
  }
  return "draft"
}

function mapRow(row: {
  id: number
  mbaNumber: string
  versionNumber: number
  status: string
  beats: CampaignReadBeats
  bodyMarkdown: string
  sources: string[] | null
  generatedAt: string
  generatedByEmail: string
  editedAt: string | null
  editedByEmail: string | null
  publishedAt: string | null
  publishedByEmail: string | null
  errorMessage: string | null
}): CampaignRead {
  return {
    id: Number(row.id),
    mbaNumber: row.mbaNumber,
    versionNumber: Number(row.versionNumber),
    status: asStatus(row.status),
    beats: parseCampaignReadBeats(row.beats),
    bodyMarkdown: row.bodyMarkdown,
    sources: Array.isArray(row.sources) ? row.sources : null,
    errorMessage: typeof row.errorMessage === "string" && row.errorMessage.trim()
      ? row.errorMessage
      : null,
    generatedAt: row.generatedAt,
    generatedByEmail: row.generatedByEmail,
    editedAt: row.editedAt,
    editedByEmail: row.editedByEmail,
    publishedAt: row.publishedAt,
    publishedByEmail: row.publishedByEmail,
  }
}

function mbaMatch(mbaNumber: string) {
  return sql`lower(${schema.campaignReads.mbaNumber}) = lower(${mbaNumber.trim()})`
}

function isMissingTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /campaign_reads|42703|42P01/i.test(message)
}

export async function insertCampaignReadDraft(input: {
  mbaNumber: string
  versionNumber: number
  beats: CampaignReadBeats
  sources: string[] | null
  generatedByEmail: string
}): Promise<CampaignRead> {
  const mbaNumber = input.mbaNumber.trim()
  const bodyMarkdown = renderCampaignReadMarkdown(input.beats)
  const db = getDb()
  try {
    const [row] = await db
      .insert(schema.campaignReads)
      .values({
        mbaNumber,
        versionNumber: input.versionNumber,
        status: "draft",
        beats: input.beats,
        bodyMarkdown,
        sources: input.sources,
        generatedByEmail: input.generatedByEmail.trim().toLowerCase(),
        errorMessage: null,
      })
      .returning(SELECT)
    if (!row) throw new CampaignReadError("VALIDATION", "Failed to store campaign read")
    return mapRow(row)
  } catch (err) {
    if (isMissingTable(err)) {
      throw new CampaignReadError(
        "UNAVAILABLE",
        "campaign_reads is not applied yet (0079/0082)",
      )
    }
    throw err
  }
}

export async function insertCampaignReadGenerating(input: {
  mbaNumber: string
  versionNumber: number
  generatedByEmail: string
}): Promise<CampaignRead> {
  const mbaNumber = input.mbaNumber.trim()
  const beats = emptyCampaignReadBeats()
  const db = getDb()
  try {
    const [row] = await db
      .insert(schema.campaignReads)
      .values({
        mbaNumber,
        versionNumber: input.versionNumber,
        status: "generating",
        beats,
        bodyMarkdown: renderCampaignReadMarkdown(beats),
        sources: null,
        generatedByEmail: input.generatedByEmail.trim().toLowerCase(),
        errorMessage: null,
      })
      .returning(SELECT)
    if (!row) throw new CampaignReadError("VALIDATION", "Failed to store campaign read")
    return mapRow(row)
  } catch (err) {
    if (isMissingTable(err)) {
      throw new CampaignReadError(
        "UNAVAILABLE",
        "campaign_reads is not applied yet (0079/0082)",
      )
    }
    throw err
  }
}

export async function completeCampaignReadDraft(input: {
  id: number
  beats: CampaignReadBeats
  sources: string[] | null
}): Promise<CampaignRead> {
  const bodyMarkdown = renderCampaignReadMarkdown(input.beats)
  const db = getDb()
  try {
    const [row] = await db
      .update(schema.campaignReads)
      .set({
        status: "draft",
        beats: input.beats,
        bodyMarkdown,
        sources: input.sources,
        errorMessage: null,
      })
      .where(eq(schema.campaignReads.id, input.id))
      .returning(SELECT)
    if (!row) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")
    return mapRow(row)
  } catch (err) {
    if (isMissingTable(err)) {
      throw new CampaignReadError(
        "UNAVAILABLE",
        "campaign_reads is not applied yet (0079/0082)",
      )
    }
    throw err
  }
}

export async function failStaleGeneratingReads(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - GENERATING_STALE_MS).toISOString()
  const db = getDb()
  try {
    const rows = await db
      .update(schema.campaignReads)
      .set({
        status: "failed",
        errorMessage: GENERATING_STALE_ERROR,
      })
      .where(
        and(
          eq(schema.campaignReads.status, "generating"),
          lt(schema.campaignReads.generatedAt, cutoff),
        ),
      )
      .returning({ id: schema.campaignReads.id })
    return rows.length
  } catch (err) {
    if (isMissingTable(err)) return 0
    throw err
  }
}

export async function failCampaignRead(input: {
  id: number
  message: string
}): Promise<CampaignRead> {
  const errorMessage = input.message.replace(/\s+/g, " ").trim().slice(0, 2000) || "generate_failed"
  const db = getDb()
  try {
    const [row] = await db
      .update(schema.campaignReads)
      .set({
        status: "failed",
        errorMessage,
      })
      .where(eq(schema.campaignReads.id, input.id))
      .returning(SELECT)
    if (!row) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")
    return mapRow(row)
  } catch (err) {
    if (isMissingTable(err)) {
      throw new CampaignReadError(
        "UNAVAILABLE",
        "campaign_reads is not applied yet (0079/0082)",
      )
    }
    throw err
  }
}

export async function getCampaignReadById(id: number): Promise<CampaignRead | null> {
  const db = getDb()
  try {
    const [row] = await db
      .select(SELECT)
      .from(schema.campaignReads)
      .where(eq(schema.campaignReads.id, id))
      .limit(1)
    return row ? mapRow(row) : null
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

export async function getLatestPublishedCampaignRead(
  mbaNumber: string,
): Promise<CampaignRead | null> {
  const db = getDb()
  try {
    const [row] = await db
      .select(SELECT)
      .from(schema.campaignReads)
      .where(and(mbaMatch(mbaNumber), eq(schema.campaignReads.status, "published")))
      .orderBy(desc(schema.campaignReads.publishedAt), desc(schema.campaignReads.id))
      .limit(1)
    return row ? mapRow(row) : null
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

export async function getPublishedCampaignRead(
  mbaNumber: string,
  versionNumber: number,
): Promise<CampaignRead | null> {
  const db = getDb()
  try {
    const [row] = await db
      .select(SELECT)
      .from(schema.campaignReads)
      .where(
        and(
          mbaMatch(mbaNumber),
          eq(schema.campaignReads.versionNumber, versionNumber),
          eq(schema.campaignReads.status, "published"),
        ),
      )
      .orderBy(desc(schema.campaignReads.publishedAt), desc(schema.campaignReads.id))
      .limit(1)
    return row ? mapRow(row) : null
  } catch (err) {
    if (isMissingTable(err)) return null
    throw err
  }
}

export async function listCampaignReadsForMba(input: {
  mbaNumber: string
  versionNumber: number
  includeDrafts: boolean
}): Promise<CampaignReadListPayload> {
  const db = getDb()
  let rows: CampaignRead[] = []
  try {
    const found = await db
      .select(SELECT)
      .from(schema.campaignReads)
      .where(
        and(mbaMatch(input.mbaNumber), eq(schema.campaignReads.versionNumber, input.versionNumber)),
      )
      .orderBy(desc(schema.campaignReads.generatedAt), desc(schema.campaignReads.id))
    rows = found.map(mapRow)
  } catch (err) {
    if (isMissingTable(err)) {
      return { published: null, draft: null, generating: null, failed: null, history: [] }
    }
    throw err
  }

  const published = rows.find((r) => r.status === "published") ?? null
  const draft = rows.find((r) => r.status === "draft") ?? null
  const generating = rows.find((r) => r.status === "generating") ?? null
  const failed = rows.find((r) => r.status === "failed") ?? null
  if (!input.includeDrafts) {
    return { published, draft: null, generating: null, failed: null, history: [] }
  }
  return { published, draft, generating, failed, history: rows }
}

export async function updateCampaignReadBeats(input: {
  id: number
  beats: CampaignReadBeats
  actorEmail: string
}): Promise<CampaignRead> {
  const existing = await getCampaignReadById(input.id)
  if (!existing) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")
  if (existing.status === "generating") {
    throw new CampaignReadError("VALIDATION", "Cannot edit a read that is still generating")
  }

  const bodyMarkdown = renderCampaignReadMarkdown(input.beats)
  const actor = input.actorEmail.trim().toLowerCase()
  const db = getDb()
  const [row] = await db
    .update(schema.campaignReads)
    .set({
      beats: input.beats,
      bodyMarkdown,
      status: "draft",
      publishedAt: null,
      publishedByEmail: null,
      editedAt: sql`now()`,
      editedByEmail: actor,
    })
    .where(eq(schema.campaignReads.id, input.id))
    .returning(SELECT)
  if (!row) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")
  return mapRow(row)
}

export async function publishCampaignRead(input: {
  id: number
  actorEmail: string
}): Promise<CampaignRead> {
  const existing = await getCampaignReadById(input.id)
  if (!existing) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")
  if (existing.status !== "draft") {
    throw new CampaignReadError("VALIDATION", "Only a draft can be published")
  }

  const actor = input.actorEmail.trim().toLowerCase()
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx
      .update(schema.campaignReads)
      .set({
        status: "draft",
        publishedAt: null,
        publishedByEmail: null,
      })
      .where(
        and(
          mbaMatch(existing.mbaNumber),
          eq(schema.campaignReads.versionNumber, existing.versionNumber),
          eq(schema.campaignReads.status, "published"),
        ),
      )

    const [row] = await tx
      .update(schema.campaignReads)
      .set({
        status: "published" satisfies CampaignReadStatus,
        publishedAt: sql`now()`,
        publishedByEmail: actor,
      })
      .where(eq(schema.campaignReads.id, input.id))
      .returning(SELECT)
    if (!row) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")
    return mapRow(row)
  })
}

export async function unpublishCampaignRead(input: {
  id: number
  actorEmail: string
}): Promise<CampaignRead> {
  const existing = await getCampaignReadById(input.id)
  if (!existing) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")

  const actor = input.actorEmail.trim().toLowerCase()
  const db = getDb()
  const [row] = await db
    .update(schema.campaignReads)
    .set({
      status: "draft",
      publishedAt: null,
      publishedByEmail: null,
      editedAt: sql`now()`,
      editedByEmail: actor,
    })
    .where(eq(schema.campaignReads.id, input.id))
    .returning(SELECT)
  if (!row) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")
  return mapRow(row)
}
