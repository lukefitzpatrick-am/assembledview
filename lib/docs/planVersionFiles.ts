/**
 * Plan-version document jsonb (`media_plan_file` / `mba_pdf_file` /
 * `aa_media_plan_file`). ETL rows are Xano Public File objects (`path`, `name`,
 * `mime`, …) with no `url` or `uploadedAt`. A http(s) `path` is the downloadable
 * location; `savedAt` falls back to the version `published_at`.
 */

export type PlanDocumentKind = "mba_pdf" | "media_plan" | "aa_media_plan"

export type ParsedPlanFile = {
  url: string
  savedAt: string
  filename: string
}

export type PublishedDocumentsPayload = {
  publishedVersionId: number | null
  versionNumber: number | null
  publishedAt: string | null
  files: {
    mba_pdf: { url: string; savedAt: string } | null
    media_plan: { url: string; savedAt: string } | null
    aa_media_plan: { url: string; savedAt: string } | null
  }
}

export type VersionDocumentFiles = {
  mbaPdfFile: unknown
  mediaPlanFile: unknown
  aaMediaPlanFile: unknown
}

export type PublishedVersionDocumentsRow = VersionDocumentFiles & {
  id: number
  versionNumber: number
  publishedAt: string | null
}

function asRecord(file: unknown): Record<string, unknown> | null {
  if (!file || typeof file !== "object" || Array.isArray(file)) return null
  return file as Record<string, unknown>
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed
  return null
}

function savedAtFromFile(obj: Record<string, unknown>, fallback: string | null): string | null {
  const candidates: unknown[] = [obj.uploadedAt, obj.uploaded_at, obj.savedAt, obj.saved_at]
  const meta =
    obj.meta && typeof obj.meta === "object" && !Array.isArray(obj.meta)
      ? (obj.meta as Record<string, unknown>)
      : null
  if (meta) {
    candidates.push(meta.uploadedAt, meta.uploaded_at, meta.savedAt, meta.saved_at)
  }
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return fallback
}

export function parsePlanFileJson(
  file: unknown,
  fallbackSavedAt: string | null,
): ParsedPlanFile | null {
  const obj = asRecord(file)
  if (!obj) return null
  const url = httpUrl(obj.url) ?? httpUrl(obj.path)
  if (!url) return null
  const savedAt = savedAtFromFile(obj, fallbackSavedAt)
  if (!savedAt) return null
  const filename =
    typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : "download"
  return { url, savedAt, filename }
}

export function unpublishedDocumentsPayload(): PublishedDocumentsPayload {
  return {
    publishedVersionId: null,
    versionNumber: null,
    publishedAt: null,
    files: { mba_pdf: null, media_plan: null, aa_media_plan: null },
  }
}

function toApiFile(
  file: unknown,
  publishedAt: string | null,
): { url: string; savedAt: string } | null {
  const parsed = parsePlanFileJson(file, publishedAt)
  if (!parsed) return null
  return { url: parsed.url, savedAt: parsed.savedAt }
}

export function buildPublishedDocumentsPayload(
  version: PublishedVersionDocumentsRow,
): PublishedDocumentsPayload {
  const publishedAt = version.publishedAt
  return {
    publishedVersionId: version.id,
    versionNumber: version.versionNumber,
    publishedAt,
    files: {
      mba_pdf: toApiFile(version.mbaPdfFile, publishedAt),
      media_plan: toApiFile(version.mediaPlanFile, publishedAt),
      aa_media_plan: toApiFile(version.aaMediaPlanFile, publishedAt),
    },
  }
}

export function parseDownloadKind(kind: string | null): PlanDocumentKind {
  if (kind === "mba_pdf" || kind === "aa_media_plan") return kind
  return "media_plan"
}

export function fileJsonForKind(kind: PlanDocumentKind, files: VersionDocumentFiles): unknown {
  if (kind === "mba_pdf") return files.mbaPdfFile
  if (kind === "aa_media_plan") return files.aaMediaPlanFile
  return files.mediaPlanFile
}
