import "server-only"

import { and, eq, sql } from "drizzle-orm"
import { getDb, schema } from "@/db"
import type { CreativeAsset, CreativeAssetWritable } from "@/lib/creative/types"

type CreativeAssetRow = typeof schema.creativeAsset.$inferSelect
type CreativeAssetInsert = typeof schema.creativeAsset.$inferInsert

export class XanoCreativeAssetError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "XanoCreativeAssetError"
    this.status = status
  }
}

function mapDbError(error: unknown, context: string): never {
  if (error instanceof XanoCreativeAssetError) {
    throw error
  }
  console.error(`[creative-assets] ${context}`, error)
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("DATABASE_URL")) {
    throw new XanoCreativeAssetError("DATABASE_URL is not set", 500)
  }
  throw new XanoCreativeAssetError(`${context} failed`, 502)
}

function toUnixMs(value: string | null | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function numOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function asStatus(value: string | null | undefined): CreativeAsset["status"] {
  return value === "archived" ? "archived" : "active"
}

function asRole(value: string | null | undefined): CreativeAsset["uploaded_by_role"] {
  return value === "client" ? "client" : "admin"
}

function rowToApi(row: CreativeAssetRow): CreativeAsset {
  return {
    id: row.id,
    created_at: toUnixMs(row.createdAt),
    mba_number: row.mbaNumber ?? "",
    media_plan_master_id: row.mediaPlanMasterId ?? 0,
    line_item_id: row.lineItemId ?? "",
    source_table: row.sourceTable ?? "",
    asset_name: row.assetName ?? "",
    original_filename: row.originalFilename ?? "",
    mime_type: row.mimeType ?? "",
    file_size_bytes: row.fileSizeBytes ?? 0,
    width_px: row.widthPx ?? 0,
    height_px: row.heightPx ?? 0,
    duration_seconds: numOrZero(row.durationSeconds),
    blob_url: row.blobUrl ?? "",
    blob_pathname: row.blobPathname ?? "",
    status: asStatus(row.status),
    uploaded_by_email: row.uploadedByEmail ?? "",
    uploaded_by_role: asRole(row.uploadedByRole),
    // PG schema has no uploaded_by_name
    uploaded_by_name: "",
  }
}

function writableToInsert(body: CreativeAssetWritable): CreativeAssetInsert {
  // uploaded_by_name is intentionally not persisted (no PG column)
  return {
    mbaNumber: body.mba_number,
    mediaPlanMasterId: body.media_plan_master_id,
    lineItemId: body.line_item_id,
    sourceTable: body.source_table,
    assetName: body.asset_name,
    originalFilename: body.original_filename,
    mimeType: body.mime_type,
    fileSizeBytes: body.file_size_bytes,
    widthPx: body.width_px,
    heightPx: body.height_px,
    durationSeconds: String(body.duration_seconds),
    blobUrl: body.blob_url,
    blobPathname: body.blob_pathname,
    status: body.status,
    uploadedByEmail: body.uploaded_by_email,
    uploadedByRole: body.uploaded_by_role,
  }
}

function patchToUpdate(
  body: Partial<CreativeAssetWritable>,
): Partial<CreativeAssetInsert> {
  const patch: Partial<CreativeAssetInsert> = {}
  if (body.mba_number !== undefined) patch.mbaNumber = body.mba_number
  if (body.media_plan_master_id !== undefined) {
    patch.mediaPlanMasterId = body.media_plan_master_id
  }
  if (body.line_item_id !== undefined) patch.lineItemId = body.line_item_id
  if (body.source_table !== undefined) patch.sourceTable = body.source_table
  if (body.asset_name !== undefined) patch.assetName = body.asset_name
  if (body.original_filename !== undefined) {
    patch.originalFilename = body.original_filename
  }
  if (body.mime_type !== undefined) patch.mimeType = body.mime_type
  if (body.file_size_bytes !== undefined) patch.fileSizeBytes = body.file_size_bytes
  if (body.width_px !== undefined) patch.widthPx = body.width_px
  if (body.height_px !== undefined) patch.heightPx = body.height_px
  if (body.duration_seconds !== undefined) {
    patch.durationSeconds = String(body.duration_seconds)
  }
  if (body.blob_url !== undefined) patch.blobUrl = body.blob_url
  if (body.blob_pathname !== undefined) patch.blobPathname = body.blob_pathname
  if (body.status !== undefined) patch.status = body.status
  if (body.uploaded_by_email !== undefined) {
    patch.uploadedByEmail = body.uploaded_by_email
  }
  if (body.uploaded_by_role !== undefined) {
    patch.uploadedByRole = body.uploaded_by_role
  }
  // uploaded_by_name ignored — no PG column
  return patch
}

export async function listByMba(mbaNumber?: string): Promise<CreativeAsset[]> {
  try {
    const db = getDb()
    if (!mbaNumber?.trim()) {
      const rows = await db.select().from(schema.creativeAsset)
      return rows.map(rowToApi)
    }
    const needle = mbaNumber.trim().toLowerCase()
    const rows = await db
      .select()
      .from(schema.creativeAsset)
      .where(sql`lower(${schema.creativeAsset.mbaNumber}) = ${needle}`)
    return rows.map(rowToApi)
  } catch (error) {
    mapDbError(error, "listByMba")
  }
}

export async function getById(id: number): Promise<CreativeAsset | null> {
  try {
    const db = getDb()
    const [row] = await db
      .select()
      .from(schema.creativeAsset)
      .where(eq(schema.creativeAsset.id, id))
      .limit(1)
    return row ? rowToApi(row) : null
  } catch (error) {
    mapDbError(error, "getById")
  }
}

export async function findByBlobPathname(
  blobPathname: string,
  mbaNumber?: string,
): Promise<CreativeAsset | null> {
  try {
    const db = getDb()
    const conditions = [eq(schema.creativeAsset.blobPathname, blobPathname)]
    if (mbaNumber?.trim()) {
      const needle = mbaNumber.trim().toLowerCase()
      conditions.push(sql`lower(${schema.creativeAsset.mbaNumber}) = ${needle}`)
    }
    const [row] = await db
      .select()
      .from(schema.creativeAsset)
      .where(and(...conditions))
      .limit(1)
    return row ? rowToApi(row) : null
  } catch (error) {
    mapDbError(error, "findByBlobPathname")
  }
}

export async function create(body: CreativeAssetWritable): Promise<CreativeAsset> {
  try {
    const db = getDb()
    const [row] = await db
      .insert(schema.creativeAsset)
      .values(writableToInsert(body))
      .returning()
    if (!row) {
      throw new XanoCreativeAssetError("create failed: no row returned", 502)
    }
    return rowToApi(row)
  } catch (error) {
    mapDbError(error, "create")
  }
}

export async function createIdempotent(body: CreativeAssetWritable): Promise<CreativeAsset> {
  const existing = await findByBlobPathname(body.blob_pathname, body.mba_number)
  if (existing) return existing
  return create(body)
}

export async function update(
  id: number,
  body: Partial<CreativeAssetWritable>,
): Promise<CreativeAsset> {
  try {
    const db = getDb()
    const patch = patchToUpdate(body)
    const [row] = await db
      .update(schema.creativeAsset)
      .set(patch)
      .where(eq(schema.creativeAsset.id, id))
      .returning()
    if (!row) {
      throw new XanoCreativeAssetError("Not found", 404)
    }
    return rowToApi(row)
  } catch (error) {
    mapDbError(error, "update")
  }
}

export async function remove(id: number): Promise<void> {
  try {
    const db = getDb()
    const deleted = await db
      .delete(schema.creativeAsset)
      .where(eq(schema.creativeAsset.id, id))
      .returning({ id: schema.creativeAsset.id })
    if (deleted.length === 0) {
      throw new XanoCreativeAssetError("Not found", 404)
    }
  } catch (error) {
    mapDbError(error, "remove")
  }
}
