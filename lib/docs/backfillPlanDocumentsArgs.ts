/**
 * CLI flags for `scripts/backfill-plan-documents.ts`.
 *
 * `--out <dir>` regenerates onto disk only (no Blob, no Postgres). `--mba`
 * plus `--version` select that version row even when it is not the master's
 * current `published_version_id`. `isVersionPublished` still gates generate.
 * `--kinds media_plan,aa_media_plan,mba_pdf` defaults to all three.
 * `--refresh-before <ISO>` selects current published pointers whose stored
 * file jsonb `uploadedAt` is earlier than the given time (stale files) and
 * regenerates them with force. It cannot be combined with `--out`.
 */

import {
  PLAN_DOCUMENT_KINDS,
  parseRegenerateKinds,
  type PlanDocumentKind,
} from "@/lib/docs/planVersionFiles"

export const BACKFILL_PLAN_DOCUMENTS_MARKER_PREFIX =
  "doc2_plan_documents_backfill"

export function backfillPlanDocumentsMarkerKey(kind: PlanDocumentKind): string {
  return `${BACKFILL_PLAN_DOCUMENTS_MARKER_PREFIX}:${kind}`
}

export function backfillKindsNotYetMarked(args: {
  kinds: PlanDocumentKind[]
  markerKeys: Iterable<string>
  force: boolean
}): PlanDocumentKind[] {
  if (args.force) return [...args.kinds]
  const keys = new Set(args.markerKeys)
  if (keys.has(BACKFILL_PLAN_DOCUMENTS_MARKER_PREFIX)) return []
  return args.kinds.filter(
    (kind) => !keys.has(backfillPlanDocumentsMarkerKey(kind)),
  )
}

export type BackfillPlanDocumentsArgs = {
  apply: boolean
  force: boolean
  mba: string | null
  version: number | null
  outDir: string | null
  kinds: PlanDocumentKind[]
  /** Normalised ISO timestamp; null when `--refresh-before` is absent. */
  refreshBefore: string | null
}

export type PlanDocumentFileBag = Record<PlanDocumentKind, unknown>

function parseVersion(raw: string | undefined): number | null {
  if (raw == null || !raw.trim()) return null
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/

function parseRefreshBefore(raw: string | undefined): string {
  const value = raw?.trim() ?? ""
  const ms = ISO_DATE_PREFIX.test(value) ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(ms)) {
    throw new Error(
      `--refresh-before needs an ISO date/time (e.g. 2026-10-19T04:30:00Z), got "${raw ?? ""}"`,
    )
  }
  return new Date(ms).toISOString()
}

function parseKindsFlag(raw: string | undefined): PlanDocumentKind[] {
  if (raw == null || !raw.trim()) return [...PLAN_DOCUMENT_KINDS]
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  return parseRegenerateKinds(parts)
}

export function hasPlanDocumentFile(value: unknown): boolean {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

export function missingRequestedKinds(
  files: PlanDocumentFileBag,
  kinds: PlanDocumentKind[],
): PlanDocumentKind[] {
  return kinds.filter((kind) => !hasPlanDocumentFile(files[kind]))
}

/** `uploadedAt` string on a stored file jsonb, or null (legacy Xano rows have none). */
export function planDocumentUploadedAt(value: unknown): string | null {
  if (!hasPlanDocumentFile(value)) return null
  const uploadedAt = (value as Record<string, unknown>).uploadedAt
  return typeof uploadedAt === "string" && uploadedAt.trim()
    ? uploadedAt.trim()
    : null
}

/**
 * Requested kinds whose stored file has an `uploadedAt` earlier than
 * `refreshBefore`. Missing files, and files without a parseable
 * `uploadedAt`, are never stale (legacy files are left alone).
 */
export function staleRequestedKinds(
  files: PlanDocumentFileBag,
  kinds: PlanDocumentKind[],
  refreshBefore: string,
): PlanDocumentKind[] {
  const cutoff = Date.parse(refreshBefore)
  if (!Number.isFinite(cutoff)) return []
  return kinds.filter((kind) => {
    const uploadedAt = planDocumentUploadedAt(files[kind])
    if (!uploadedAt) return false
    const ms = Date.parse(uploadedAt)
    return Number.isFinite(ms) && ms < cutoff
  })
}

export function countMissingByKind(
  rows: PlanDocumentFileBag[],
  kinds: PlanDocumentKind[],
): Record<PlanDocumentKind, number> {
  const counts: Record<PlanDocumentKind, number> = {
    mba_pdf: 0,
    media_plan: 0,
    aa_media_plan: 0,
  }
  for (const kind of kinds) {
    counts[kind] = rows.filter((row) => !hasPlanDocumentFile(row[kind])).length
  }
  return counts
}

export function parseBackfillPlanDocumentsArgs(
  argv: string[],
): BackfillPlanDocumentsArgs {
  let apply = false
  let force = false
  let mba: string | null = null
  let version: number | null = null
  let outDir: string | null = null
  let kindsRaw: string | undefined
  let refreshBefore: string | null = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === "--apply") apply = true
    else if (arg === "--force") force = true
    else if (arg === "--dry-run") apply = false
    else if (arg === "--mba") {
      mba = argv[i + 1] ?? null
      i++
    } else if (arg.startsWith("--mba=")) {
      mba = arg.slice("--mba=".length)
    } else if (arg === "--version") {
      version = parseVersion(argv[i + 1])
      i++
    } else if (arg.startsWith("--version=")) {
      version = parseVersion(arg.slice("--version=".length))
    } else if (arg === "--out") {
      outDir = argv[i + 1] ?? null
      i++
    } else if (arg.startsWith("--out=")) {
      outDir = arg.slice("--out=".length)
    } else if (arg === "--kinds") {
      kindsRaw = argv[i + 1]
      i++
    } else if (arg.startsWith("--kinds=")) {
      kindsRaw = arg.slice("--kinds=".length)
    } else if (arg === "--refresh-before") {
      refreshBefore = parseRefreshBefore(argv[i + 1])
      i++
    } else if (arg.startsWith("--refresh-before=")) {
      refreshBefore = parseRefreshBefore(arg.slice("--refresh-before=".length))
    }
  }

  const trimmedOut = outDir?.trim() ? outDir.trim() : null
  if (refreshBefore && trimmedOut) {
    throw new Error("--refresh-before cannot be combined with --out")
  }
  if (trimmedOut) {
    apply = false
    force = true
  }

  return {
    apply,
    force,
    mba: mba?.trim() ? mba.trim() : null,
    version,
    outDir: trimmedOut,
    kinds: parseKindsFlag(kindsRaw),
    refreshBefore,
  }
}

export function planDocumentOutFilenames(
  mba: string,
  version: number,
): Record<PlanDocumentKind, string> {
  return {
    mba_pdf: `${mba}-v${version}-mba_pdf.pdf`,
    media_plan: `${mba}-v${version}-media_plan.xlsx`,
    aa_media_plan: `${mba}-v${version}-aa_media_plan.xlsx`,
  }
}

export function storedPlanDocumentOutFilenames(
  mba: string,
  version: number,
): Record<PlanDocumentKind, string> {
  return {
    mba_pdf: `${mba}-v${version}-mba_pdf.xano.pdf`,
    media_plan: `${mba}-v${version}-media_plan.xano.xlsx`,
    aa_media_plan: `${mba}-v${version}-aa_media_plan.xano.xlsx`,
  }
}
