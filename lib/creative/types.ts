export interface CreativeAsset {
  id: number
  created_at: number
  mba_number: string
  media_plan_master_id: number
  line_item_id: string
  source_table: string
  asset_name: string
  original_filename: string
  mime_type: string
  file_size_bytes: number
  width_px: number
  height_px: number
  duration_seconds: number
  blob_url: string
  blob_pathname: string
  status: "active" | "archived"
  uploaded_by_email: string
  uploaded_by_role: "admin" | "manager" | "client"
  uploaded_by_name: string
}

export type CreativeAssetWritable = Omit<CreativeAsset, "id" | "created_at">

/** POST /api/creative-assets body keys (uploaded_by_* stamped from session). */
export const CREATIVE_ASSET_CREATE_BODY_KEYS = [
  "mba_number",
  "media_plan_master_id",
  "line_item_id",
  "source_table",
  "asset_name",
  "original_filename",
  "mime_type",
  "file_size_bytes",
  "width_px",
  "height_px",
  "duration_seconds",
  "blob_url",
  "blob_pathname",
  "status",
] as const satisfies readonly (keyof CreativeAssetWritable)[]

export const CREATIVE_ASSET_WRITABLE_KEYS = [
  "mba_number",
  "media_plan_master_id",
  "line_item_id",
  "source_table",
  "asset_name",
  "original_filename",
  "mime_type",
  "file_size_bytes",
  "width_px",
  "height_px",
  "duration_seconds",
  "blob_url",
  "blob_pathname",
  "status",
  "uploaded_by_email",
  "uploaded_by_role",
  "uploaded_by_name",
] as const satisfies readonly (keyof CreativeAssetWritable)[]

export const CREATIVE_ASSET_PATCH_KEYS = [
  "asset_name",
  "status",
  "line_item_id",
  "source_table",
  "width_px",
  "height_px",
  "duration_seconds",
] as const satisfies readonly (keyof CreativeAsset)[]

export type CreativeAssetPatch = Pick<
  CreativeAsset,
  (typeof CREATIVE_ASSET_PATCH_KEYS)[number]
>

export type UploadClientPayload = {
  mba_number: string
  line_item_id: string
  source_table: string
  media_plan_master_id?: number
  file_size_bytes?: number
}

export type UploadTokenPayload = UploadClientPayload & {
  email: string
  role: CreativeAsset["uploaded_by_role"]
  name: string
}

export function parseUploadTokenPayload(
  tokenPayload: string | null | undefined,
): { ok: true; value: UploadTokenPayload } | { ok: false; error: string } {
  if (!tokenPayload?.trim()) {
    return { ok: false, error: "tokenPayload is required" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(tokenPayload)
  } catch {
    return { ok: false, error: "tokenPayload must be valid JSON" }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "tokenPayload must be a JSON object" }
  }

  const raw = parsed as Record<string, unknown>
  const mbaNumber = typeof raw.mba_number === "string" ? raw.mba_number.trim() : ""
  if (!mbaNumber) {
    return { ok: false, error: "tokenPayload.mba_number is required" }
  }

  const role = raw.role
  if (role !== "admin" && role !== "manager" && role !== "client") {
    return { ok: false, error: "tokenPayload.role is invalid" }
  }

  return {
    ok: true,
    value: {
      mba_number: mbaNumber,
      line_item_id: typeof raw.line_item_id === "string" ? raw.line_item_id.trim() : "",
      source_table: typeof raw.source_table === "string" ? raw.source_table.trim() : "",
      email: typeof raw.email === "string" ? raw.email.trim() : "",
      role,
      name: typeof raw.name === "string" ? raw.name.trim() : "",
      media_plan_master_id:
        typeof raw.media_plan_master_id === "number" && Number.isFinite(raw.media_plan_master_id)
          ? raw.media_plan_master_id
          : Number.isFinite(Number(raw.media_plan_master_id))
            ? Number(raw.media_plan_master_id)
            : undefined,
      file_size_bytes:
        typeof raw.file_size_bytes === "number" && Number.isFinite(raw.file_size_bytes)
          ? raw.file_size_bytes
          : Number.isFinite(Number(raw.file_size_bytes))
            ? Number(raw.file_size_bytes)
            : undefined,
    },
  }
}

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

function hasOnlyKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    return `Unknown field(s): ${unknown.join(", ")}`
  }
  return null
}

function requireString(value: unknown, field: string): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return `${field} must be a non-empty string`
  }
  return null
}

function requireNumber(value: unknown, field: string): string | null {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) {
    return `${field} must be a number`
  }
  return null
}

export function validateCreativeAssetCreateBody(
  body: unknown,
): ValidationResult<Omit<CreativeAssetWritable, "uploaded_by_email" | "uploaded_by_role" | "uploaded_by_name">> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object body" }
  }

  const raw = body as Record<string, unknown>
  const unknownError = hasOnlyKeys(raw, CREATIVE_ASSET_CREATE_BODY_KEYS as unknown as string[])
  if (unknownError) {
    return { ok: false, error: unknownError }
  }

  for (const key of CREATIVE_ASSET_CREATE_BODY_KEYS) {
    if (!(key in raw)) {
      return { ok: false, error: `Missing required field: ${key}` }
    }
  }

  const requiredStringFields = [
    "mba_number",
    "asset_name",
    "original_filename",
    "mime_type",
    "blob_url",
    "blob_pathname",
  ] as const

  for (const field of requiredStringFields) {
    const err = requireString(raw[field], field)
    if (err) return { ok: false, error: err }
  }

  if (typeof raw.line_item_id !== "string") {
    return { ok: false, error: "line_item_id must be a string" }
  }
  if (typeof raw.source_table !== "string") {
    return { ok: false, error: "source_table must be a string" }
  }

  const numberFields = [
    "media_plan_master_id",
    "file_size_bytes",
    "width_px",
    "height_px",
    "duration_seconds",
  ] as const

  for (const field of numberFields) {
    const err = requireNumber(raw[field], field)
    if (err) return { ok: false, error: err }
  }

  if (raw.status !== "active" && raw.status !== "archived") {
    return { ok: false, error: "status must be active or archived" }
  }

  return {
    ok: true,
    value: {
      mba_number: String(raw.mba_number).trim(),
      media_plan_master_id: Number(raw.media_plan_master_id),
      line_item_id: String(raw.line_item_id).trim(),
      source_table: String(raw.source_table).trim(),
      asset_name: String(raw.asset_name).trim(),
      original_filename: String(raw.original_filename).trim(),
      mime_type: String(raw.mime_type).trim(),
      file_size_bytes: Number(raw.file_size_bytes),
      width_px: Number(raw.width_px),
      height_px: Number(raw.height_px),
      duration_seconds: Number(raw.duration_seconds),
      blob_url: String(raw.blob_url).trim(),
      blob_pathname: String(raw.blob_pathname).trim(),
      status: raw.status as CreativeAsset["status"],
    },
  }
}

export function validateCreativeAssetWritable(
  body: unknown,
): ValidationResult<CreativeAssetWritable> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object body" }
  }

  const raw = body as Record<string, unknown>
  const unknownError = hasOnlyKeys(raw, CREATIVE_ASSET_WRITABLE_KEYS as unknown as string[])
  if (unknownError) {
    return { ok: false, error: unknownError }
  }

  for (const key of CREATIVE_ASSET_WRITABLE_KEYS) {
    if (!(key in raw)) {
      return { ok: false, error: `Missing required field: ${key}` }
    }
  }

  const stringFields = [
    "mba_number",
    "line_item_id",
    "source_table",
    "asset_name",
    "original_filename",
    "mime_type",
    "blob_url",
    "blob_pathname",
  ] as const

  for (const field of stringFields) {
    const err = requireString(raw[field], field)
    if (err) return { ok: false, error: err }
  }

  const numberFields = [
    "media_plan_master_id",
    "file_size_bytes",
    "width_px",
    "height_px",
    "duration_seconds",
  ] as const

  for (const field of numberFields) {
    const err = requireNumber(raw[field], field)
    if (err) return { ok: false, error: err }
  }

  if (raw.status !== "active" && raw.status !== "archived") {
    return { ok: false, error: "status must be active or archived" }
  }

  const role = raw.uploaded_by_role
  if (role !== "admin" && role !== "manager" && role !== "client") {
    return { ok: false, error: "uploaded_by_role must be admin, manager, or client" }
  }

  if (typeof raw.uploaded_by_email !== "string") {
    return { ok: false, error: "uploaded_by_email must be a string" }
  }

  if (raw.uploaded_by_name !== undefined && typeof raw.uploaded_by_name !== "string") {
    return { ok: false, error: "uploaded_by_name must be a string" }
  }

  return {
    ok: true,
    value: {
      mba_number: String(raw.mba_number).trim(),
      media_plan_master_id: Number(raw.media_plan_master_id),
      line_item_id: String(raw.line_item_id).trim(),
      source_table: String(raw.source_table).trim(),
      asset_name: String(raw.asset_name).trim(),
      original_filename: String(raw.original_filename).trim(),
      mime_type: String(raw.mime_type).trim(),
      file_size_bytes: Number(raw.file_size_bytes),
      width_px: Number(raw.width_px),
      height_px: Number(raw.height_px),
      duration_seconds: Number(raw.duration_seconds),
      blob_url: String(raw.blob_url).trim(),
      blob_pathname: String(raw.blob_pathname).trim(),
      status: raw.status as CreativeAsset["status"],
      uploaded_by_email: String(raw.uploaded_by_email).trim(),
      uploaded_by_role: role as CreativeAsset["uploaded_by_role"],
      uploaded_by_name: typeof raw.uploaded_by_name === "string" ? raw.uploaded_by_name.trim() : "",
    },
  }
}

export function validateCreativeAssetPatch(
  body: unknown,
): ValidationResult<Partial<CreativeAssetPatch>> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object body" }
  }

  const raw = body as Record<string, unknown>
  const unknownError = hasOnlyKeys(raw, CREATIVE_ASSET_PATCH_KEYS as unknown as string[])
  if (unknownError) {
    return { ok: false, error: unknownError }
  }

  if (Object.keys(raw).length === 0) {
    return { ok: false, error: "No patch fields provided" }
  }

  const patch: Partial<CreativeAssetPatch> = {}

  if ("asset_name" in raw) {
    const err = requireString(raw.asset_name, "asset_name")
    if (err) return { ok: false, error: err }
    patch.asset_name = String(raw.asset_name).trim()
  }

  if ("status" in raw) {
    if (raw.status !== "active" && raw.status !== "archived") {
      return { ok: false, error: "status must be active or archived" }
    }
    patch.status = raw.status
  }

  if ("line_item_id" in raw) {
    if (typeof raw.line_item_id !== "string") {
      return { ok: false, error: "line_item_id must be a string" }
    }
    patch.line_item_id = raw.line_item_id.trim()
  }

  if ("source_table" in raw) {
    if (typeof raw.source_table !== "string") {
      return { ok: false, error: "source_table must be a string" }
    }
    patch.source_table = raw.source_table.trim()
  }

  for (const field of ["width_px", "height_px", "duration_seconds"] as const) {
    if (field in raw) {
      const err = requireNumber(raw[field], field)
      if (err) return { ok: false, error: err }
      patch[field] = Number(raw[field])
    }
  }

  return { ok: true, value: patch }
}
