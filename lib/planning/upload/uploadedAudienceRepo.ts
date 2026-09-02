import "server-only"

import { randomUUID } from "node:crypto"
import { and, eq, isNull, or } from "drizzle-orm"
import { getDb, schema } from "@/db"
import type { RmMappedChannel, RmMappingOptions, RmMappingOverrides } from "./mapRoyMorganToChannels"
import type { RmWorkbookParse } from "./royMorganTypes"

type UploadPgRow = typeof schema.planningAudienceUploads.$inferSelect
type AudiencePgRow = typeof schema.planningUploadedAudiences.$inferSelect

export class UploadedAudienceError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "UploadedAudienceError"
    this.status = status
  }
}

function mapDbError(error: unknown, context: string): never {
  if (error instanceof UploadedAudienceError) {
    throw error
  }
  console.error(`[planning-uploads] ${context}`, error)
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("DATABASE_URL")) {
    throw new UploadedAudienceError("DATABASE_URL is not set", 500)
  }
  throw new UploadedAudienceError(`${context} failed`, 502)
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asParseJson(value: unknown): RmWorkbookParse {
  return value as RmWorkbookParse
}

export type PlanningAudienceUploadRow = {
  id: number
  created_at: string
  clients_id: number | null
  file_name: string
  blob_url: string | null
  byte_size: number | null
  wave_code: string | null
  survey_period: string | null
  filter_label: string | null
  parse_json: RmWorkbookParse
  uploaded_by_email: string
  status: string
  expires_at: string | null
  retained_at: string | null
}

export type PlanningUploadedAudienceRow = {
  id: number
  created_at: string
  upload_id: number
  clients_id: number | null
  name: string
  sheet_name: string
  block_id: string
  segment_key: string
  wave_code: string | null
  filter_label: string | null
  audience_wc: number | null
  unweighted_n: number | null
  universe_wc: number | null
  mapping_json: { overrides: RmMappingOverrides; options: RmMappingOptions }
  channels_json: RmMappedChannel[]
  definition_json: unknown
  created_by_email: string
  is_archived: boolean
}

function uploadToApi(row: UploadPgRow): PlanningAudienceUploadRow {
  return {
    id: row.id,
    created_at: row.createdAt,
    clients_id: row.clientsId ?? null,
    file_name: row.fileName,
    blob_url: row.blobUrl ?? null,
    byte_size: row.byteSize ?? null,
    wave_code: row.waveCode ?? null,
    survey_period: row.surveyPeriod ?? null,
    filter_label: row.filterLabel ?? null,
    parse_json: asParseJson(row.parseJson),
    uploaded_by_email: row.uploadedByEmail,
    status: row.status,
    expires_at: row.expiresAt ?? null,
    retained_at: row.retainedAt ?? null,
  }
}

function audienceToApi(row: AudiencePgRow): PlanningUploadedAudienceRow {
  return {
    id: row.id,
    created_at: row.createdAt,
    upload_id: row.uploadId,
    clients_id: row.clientsId ?? null,
    name: row.name,
    sheet_name: row.sheetName,
    block_id: row.blockId,
    segment_key: row.segmentKey,
    wave_code: row.waveCode ?? null,
    filter_label: row.filterLabel ?? null,
    audience_wc: numOrNull(row.audienceWc),
    unweighted_n: row.unweightedN ?? null,
    universe_wc: numOrNull(row.universeWc),
    mapping_json: row.mappingJson as PlanningUploadedAudienceRow["mapping_json"],
    channels_json: (row.channelsJson ?? []) as RmMappedChannel[],
    definition_json: row.definitionJson,
    created_by_email: row.createdByEmail,
    is_archived: Boolean(row.isArchived),
  }
}

export async function createUpload(input: {
  clientsId?: number | null
  fileName: string
  blobUrl: string | null
  byteSize: number | null
  waveCode: string | null
  surveyPeriod: string | null
  filterLabel: string | null
  parseJson: RmWorkbookParse
  uploadedByEmail: string
  expiresAt: string
}): Promise<PlanningAudienceUploadRow> {
  try {
    const db = getDb()
    const [row] = await db
      .insert(schema.planningAudienceUploads)
      .values({
        clientsId: input.clientsId ?? null,
        fileName: input.fileName,
        blobUrl: input.blobUrl,
        byteSize: input.byteSize,
        waveCode: input.waveCode,
        surveyPeriod: input.surveyPeriod,
        filterLabel: input.filterLabel,
        parseJson: input.parseJson,
        uploadedByEmail: input.uploadedByEmail,
        status: "staged",
        expiresAt: input.expiresAt,
      })
      .returning()
    if (!row) {
      throw new UploadedAudienceError("create failed: no row returned", 502)
    }
    return uploadToApi(row)
  } catch (error) {
    mapDbError(error, "createUpload")
  }
}

export async function getUpload(id: number): Promise<PlanningAudienceUploadRow> {
  try {
    const db = getDb()
    const [row] = await db
      .select()
      .from(schema.planningAudienceUploads)
      .where(eq(schema.planningAudienceUploads.id, id))
      .limit(1)
    if (!row) {
      throw new UploadedAudienceError("Upload not found", 404)
    }
    return uploadToApi(row)
  } catch (error) {
    mapDbError(error, "getUpload")
  }
}

export async function markUploadSaved(id: number): Promise<PlanningAudienceUploadRow> {
  try {
    const db = getDb()
    const [row] = await db
      .update(schema.planningAudienceUploads)
      .set({
        status: "saved",
        retainedAt: new Date().toISOString(),
        expiresAt: null,
      })
      .where(eq(schema.planningAudienceUploads.id, id))
      .returning()
    if (!row) {
      throw new UploadedAudienceError("Upload not found", 404)
    }
    return uploadToApi(row)
  } catch (error) {
    mapDbError(error, "markUploadSaved")
  }
}

export async function createUploadedAudience(input: {
  uploadId: number
  clientsId: number | null
  name: string
  sheetName: string
  blockId: string
  waveCode: string | null
  filterLabel: string | null
  audienceWc: number | null
  unweightedN: number | null
  universeWc: number | null
  mappingJson: PlanningUploadedAudienceRow["mapping_json"]
  channelsJson: RmMappedChannel[]
  definitionJson: unknown
  createdByEmail: string
}): Promise<PlanningUploadedAudienceRow> {
  try {
    const db = getDb()
    const tempKey = `upl_tmp_${randomUUID()}`
    const [inserted] = await db
      .insert(schema.planningUploadedAudiences)
      .values({
        uploadId: input.uploadId,
        clientsId: input.clientsId,
        name: input.name,
        sheetName: input.sheetName,
        blockId: input.blockId,
        segmentKey: tempKey,
        waveCode: input.waveCode,
        filterLabel: input.filterLabel,
        audienceWc: input.audienceWc == null ? null : String(input.audienceWc),
        unweightedN: input.unweightedN,
        universeWc: input.universeWc == null ? null : String(input.universeWc),
        mappingJson: input.mappingJson,
        channelsJson: input.channelsJson,
        definitionJson: input.definitionJson,
        createdByEmail: input.createdByEmail,
      })
      .returning()
    if (!inserted) {
      throw new UploadedAudienceError("create failed: no row returned", 502)
    }
    const [patched] = await db
      .update(schema.planningUploadedAudiences)
      .set({ segmentKey: `upl_${inserted.id}` })
      .where(eq(schema.planningUploadedAudiences.id, inserted.id))
      .returning()
    if (!patched) {
      throw new UploadedAudienceError("create failed: segment_key patch returned no row", 502)
    }
    return audienceToApi(patched)
  } catch (error) {
    mapDbError(error, "createUploadedAudience")
  }
}

export async function listUploadedAudiences(opts: {
  clientsId?: number
}): Promise<PlanningUploadedAudienceRow[]> {
  try {
    const db = getDb()
    const table = schema.planningUploadedAudiences
    const live = eq(table.isArchived, false)
    const rows =
      opts.clientsId == null
        ? await db.select().from(table).where(live)
        : await db
            .select()
            .from(table)
            .where(
              and(
                live,
                or(eq(table.clientsId, opts.clientsId), isNull(table.clientsId))
              )
            )
    return rows.map(audienceToApi)
  } catch (error) {
    mapDbError(error, "listUploadedAudiences")
  }
}

export async function getUploadedAudience(id: number): Promise<PlanningUploadedAudienceRow> {
  try {
    const db = getDb()
    const [row] = await db
      .select()
      .from(schema.planningUploadedAudiences)
      .where(eq(schema.planningUploadedAudiences.id, id))
      .limit(1)
    if (!row) {
      throw new UploadedAudienceError("Uploaded audience not found", 404)
    }
    return audienceToApi(row)
  } catch (error) {
    mapDbError(error, "getUploadedAudience")
  }
}

export async function archiveUploadedAudience(
  id: number
): Promise<PlanningUploadedAudienceRow> {
  try {
    const db = getDb()
    const [row] = await db
      .update(schema.planningUploadedAudiences)
      .set({ isArchived: true })
      .where(eq(schema.planningUploadedAudiences.id, id))
      .returning()
    if (!row) {
      throw new UploadedAudienceError("Uploaded audience not found", 404)
    }
    return audienceToApi(row)
  } catch (error) {
    mapDbError(error, "archiveUploadedAudience")
  }
}
