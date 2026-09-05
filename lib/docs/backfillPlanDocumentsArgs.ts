/**
 * CLI flags for `scripts/backfill-plan-documents.ts`.
 *
 * `--out <dir>` regenerates onto disk only (no Blob, no Postgres). `--mba`
 * plus `--version` select that version row even when it is not the master's
 * current `published_version_id`. `isVersionPublished` still gates generate.
 * `--kinds media_plan,aa_media_plan,mba_pdf` defaults to all three.
 */

import {
  PLAN_DOCUMENT_KINDS,
  parseRegenerateKinds,
  type PlanDocumentKind,
} from "@/lib/docs/planVersionFiles"

export type BackfillPlanDocumentsArgs = {
  apply: boolean
  force: boolean
  mba: string | null
  version: number | null
  outDir: string | null
  kinds: PlanDocumentKind[]
}

export type PlanDocumentFileBag = Record<PlanDocumentKind, unknown>

function parseVersion(raw: string | undefined): number | null {
  if (raw == null || !raw.trim()) return null
  const n = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
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
    }
  }

  const trimmedOut = outDir?.trim() ? outDir.trim() : null
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
