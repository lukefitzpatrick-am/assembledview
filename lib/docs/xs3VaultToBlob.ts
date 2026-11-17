/**
 * XS-3 pure rules for copying Xano vault plan files onto Vercel Blob.
 * The copy ran 19 Oct 2026 (1,899 files, 0 failures).
 * The copy script (`scripts/_archive/xano/migration/xs3-vault-to-blob.ts`) was
 * deleted in B18; git history keeps it.
 */
import { planDocumentBlobPathname } from "@/lib/docs/planDocumentBlob"
import type { PlanDocumentKind } from "@/lib/docs/planVersionFiles"

export const XS3_KINDS = ["media_plan", "mba_pdf", "aa_media_plan"] as const satisfies readonly PlanDocumentKind[]

export type Xs3Kind = (typeof XS3_KINDS)[number]

const FILE_KEY = {
  media_plan: "mediaPlanFile",
  mba_pdf: "mbaPdfFile",
  aa_media_plan: "aaMediaPlanFile",
} as const satisfies Record<Xs3Kind, "mediaPlanFile" | "mbaPdfFile" | "aaMediaPlanFile">

export type Xs3VersionRow = {
  id: number
  versionNumber: number
  mbaNumber: string
  mediaPlanFile: unknown
  mbaPdfFile: unknown
  aaMediaPlanFile: unknown
}

export type Xs3WorkItem = {
  versionId: number
  versionNumber: number
  mbaNumber: string
  kind: Xs3Kind
  url: string
  name: string
  mime: string
}

export type Xs3MigratedFileJson = {
  url: string
  mime: string
  name: string
  size: number
  source: "migrated_from_xano"
  pathname: string
  xano_url: string
}

function asRecord(file: unknown): Record<string, unknown> | null {
  if (!file || typeof file !== "object" || Array.isArray(file)) return null
  return file as Record<string, unknown>
}

export function storedFileUrl(file: unknown): string | null {
  const url = asRecord(file)?.url
  return typeof url === "string" && url.trim() ? url.trim() : null
}

export function isXanoVaultUrl(url: string): boolean {
  return url.toLowerCase().includes("xano.io")
}

/** Skip rule: the column already points at the private Blob store. */
export function shouldSkipBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith("blob.vercel-storage.com")
  } catch {
    return url.toLowerCase().includes("blob.vercel-storage.com")
  }
}

export function vaultFileName(file: unknown, url: string): string {
  const name = asRecord(file)?.name
  if (typeof name === "string" && name.trim()) return name.trim()
  try {
    const last = new URL(url).pathname.split("/").pop()
    if (last && last !== "." && last !== "..") return decodeURIComponent(last)
  } catch {
    /* keep the fallback */
  }
  return "file"
}

export function vaultFileMime(file: unknown, filename: string): string {
  const mime = asRecord(file)?.mime
  if (typeof mime === "string" && mime.trim()) return mime.trim()
  const lower = filename.toLowerCase()
  if (lower.endsWith(".pdf")) return "application/pdf"
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }
  return "application/octet-stream"
}

/**
 * Columns on this row whose `url` still contains `xano.io` and is not already
 * a Blob URL. `kinds` limits the scan (`--kind`).
 */
export function selectVaultWorkItems(
  row: Xs3VersionRow,
  kinds: readonly Xs3Kind[] = XS3_KINDS,
): Xs3WorkItem[] {
  const items: Xs3WorkItem[] = []
  for (const kind of kinds) {
    const file = row[FILE_KEY[kind]]
    const url = storedFileUrl(file)
    if (!url || shouldSkipBlobUrl(url) || !isXanoVaultUrl(url)) continue
    const name = vaultFileName(file, url)
    items.push({
      versionId: row.id,
      versionNumber: row.versionNumber,
      mbaNumber: row.mbaNumber,
      kind,
      url,
      name,
      mime: vaultFileMime(file, name),
    })
  }
  return items
}

/** Same pathname the live upload uses: `plans/{MBA}/v{n}/{kind}/{name}`. */
export function xs3BlobPathname(
  mbaNumber: string,
  versionNumber: number,
  kind: Xs3Kind,
  filename: string,
): string {
  return planDocumentBlobPathname(mbaNumber, versionNumber, kind, filename)
}

export type Xs3RunArgs = {
  dryRun: boolean
  limit: number | null
  kind: Xs3Kind | null
}
