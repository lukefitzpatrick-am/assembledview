import { and, desc, eq, sql } from "drizzle-orm"

import { getDb, schema } from "@/db"

import { parseCampaignReadBeats, renderCampaignReadMarkdown } from "./beats"
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
} as const

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
}): CampaignRead {
  return {
    id: Number(row.id),
    mbaNumber: row.mbaNumber,
    versionNumber: Number(row.versionNumber),
    status: row.status === "published" ? "published" : "draft",
    beats: parseCampaignReadBeats(row.beats),
    bodyMarkdown: row.bodyMarkdown,
    sources: Array.isArray(row.sources) ? row.sources : null,
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
      })
      .returning(SELECT)
    if (!row) throw new CampaignReadError("VALIDATION", "Failed to store campaign read")
    return mapRow(row)
  } catch (err) {
    if (isMissingTable(err)) {
      throw new CampaignReadError(
        "UNAVAILABLE",
        "campaign_reads is not applied yet (0079)",
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
      return { published: null, draft: null, history: [] }
    }
    throw err
  }

  const published = rows.find((r) => r.status === "published") ?? null
  const draft = rows.find((r) => r.status === "draft") ?? null
  if (!input.includeDrafts) {
    return { published, draft: null, history: [] }
  }
  return { published, draft, history: rows }
}

export async function updateCampaignReadBeats(input: {
  id: number
  beats: CampaignReadBeats
  actorEmail: string
}): Promise<CampaignRead> {
  const existing = await getCampaignReadById(input.id)
  if (!existing) throw new CampaignReadError("NOT_FOUND", "Campaign read not found")

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
