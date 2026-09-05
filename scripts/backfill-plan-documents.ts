/**
 * Backfill MBA PDF / media plan / AA workbooks for published versions that
 * have published_at set but are missing one or more file jsonb columns.
 *
 * Calls regeneratePlanVersionDocuments (the same service as
 * POST /api/mediaplans/versions/[id]/documents/regenerate). Never mutates
 * approved_slice, published_at, schedule_months, or line items.
 *
 * Usage:
 *   npm run docs:backfill              # dry-run (default)
 *   npm run docs:backfill -- --apply
 *   npm run docs:backfill -- --mba glenda008
 *   npm run docs:backfill -- --apply --force
 */

import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm"

import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

const MARKER_KEY = "doc2_plan_documents_backfill"
const GAP_MS = 1000

type Candidate = {
  versionId: number
  versionNumber: number
  mbaNumber: string
  publishedAt: string | null
  mbaPdfFile: unknown
  mediaPlanFile: unknown
  aaMediaPlanFile: unknown
}

function parseArgs(argv: string[]) {
  let apply = false
  let force = false
  let mba: string | null = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--apply") apply = true
    else if (arg === "--force") force = true
    else if (arg === "--dry-run") apply = false
    else if (arg === "--mba") {
      mba = argv[i + 1] ?? null
      i++
    } else if (arg.startsWith("--mba=")) {
      mba = arg.slice("--mba=".length)
    }
  }
  return {
    apply,
    force,
    mba: mba?.trim() ? mba.trim() : null,
  }
}

function hasFile(value: unknown): boolean {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

function missingKinds(row: Candidate): string[] {
  const missing: string[] = []
  if (!hasFile(row.mbaPdfFile)) missing.push("mba_pdf")
  if (!hasFile(row.mediaPlanFile)) missing.push("media_plan")
  if (!hasFile(row.aaMediaPlanFile)) missing.push("aa_media_plan")
  return missing
}

function pad(value: unknown, width: number): string {
  return String(value ?? "").padEnd(width)
}

function printCandidateList(rows: Candidate[]) {
  console.log("mba              v     version_id  missing")
  console.log("----------------  ----  ----------  --------------------------------")
  for (const row of rows) {
    console.log(
      `${pad(row.mbaNumber, 16)}  ${pad(row.versionNumber, 4)}  ${pad(row.versionId, 10)}  ${missingKinds(row).join(", ")}`,
    )
  }
}

function statusForKind(
  results: Array<{ kind: string; status: string; error?: string }>,
  kind: string,
): string {
  const hit = results.find((r) => r.kind === kind)
  if (!hit) return "—"
  return hit.status === "error" ? `error:${hit.error ?? ""}` : hit.status
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const { closeDb, getDb, schema } = await import("@/db")
  const { apply, force, mba } = parseArgs(process.argv.slice(2))
  const db = getDb()

  try {
    const [marker] = await db
      .select()
      .from(schema.migrationMarkers)
      .where(eq(schema.migrationMarkers.key, MARKER_KEY))
      .limit(1)

    if (apply && marker && !force) {
      console.error(
        `Refusing: migration_markers.${MARKER_KEY} already applied at ${marker.appliedAt}. Pass --force to re-run.`,
      )
      process.exitCode = 1
      return
    }

    const filter = mba
      ? sql`lower(trim(${schema.mediaPlanMasters.mbaNumber})) = ${mba.toLowerCase()}`
      : undefined
    const publishedPointer = eq(
      schema.mediaPlanMasters.publishedVersionId,
      schema.mediaPlanVersions.id,
    )
    const fileMissing = or(
      isNull(schema.mediaPlanVersions.mbaPdfFile),
      isNull(schema.mediaPlanVersions.mediaPlanFile),
      isNull(schema.mediaPlanVersions.aaMediaPlanFile),
    )
    const missingWhere = filter
      ? and(isNotNull(schema.mediaPlanVersions.publishedAt), fileMissing, filter)
      : and(isNotNull(schema.mediaPlanVersions.publishedAt), fileMissing)
    const unpublishedWhere = filter
      ? and(isNull(schema.mediaPlanVersions.publishedAt), filter)
      : isNull(schema.mediaPlanVersions.publishedAt)

    const candidateSelect = {
      versionId: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
      publishedAt: schema.mediaPlanVersions.publishedAt,
      mbaPdfFile: schema.mediaPlanVersions.mbaPdfFile,
      mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
      aaMediaPlanFile: schema.mediaPlanVersions.aaMediaPlanFile,
    }

    const missingFiles: Candidate[] = await db
      .select(candidateSelect)
      .from(schema.mediaPlanMasters)
      .innerJoin(schema.mediaPlanVersions, publishedPointer)
      .where(missingWhere)
      .orderBy(schema.mediaPlanMasters.mbaNumber, schema.mediaPlanVersions.versionNumber)

    const needsPublishedAt: Candidate[] = await db
      .select(candidateSelect)
      .from(schema.mediaPlanMasters)
      .innerJoin(schema.mediaPlanVersions, publishedPointer)
      .where(unpublishedWhere)
      .orderBy(schema.mediaPlanMasters.mbaNumber, schema.mediaPlanVersions.versionNumber)

    console.log(
      apply
        ? `APPLY${force ? " --force" : ""}${mba ? ` --mba ${mba}` : ""}`
        : `DRY-RUN${mba ? ` --mba ${mba}` : ""} (pass --apply to write Blob + jsonb)`,
    )
    console.log("")
    console.log(
      `Published versions missing at least one file (${missingFiles.length}):`,
    )
    if (missingFiles.length === 0) {
      console.log("  (none)")
    } else {
      printCandidateList(missingFiles)
    }

    console.log("")
    console.log(
      `Needs published_at backfill first (published_version_id, published_at NULL) (${needsPublishedAt.length}):`,
    )
    if (needsPublishedAt.length === 0) {
      console.log("  (none)")
    } else {
      console.log("mba              v     version_id")
      console.log("----------------  ----  ----------")
      for (const row of needsPublishedAt) {
        console.log(
          `${pad(row.mbaNumber, 16)}  ${pad(row.versionNumber, 4)}  ${row.versionId}`,
        )
      }
    }

    if (!apply) return

    const { regeneratePlanVersionDocuments } = await import(
      "@/lib/docs/regeneratePlanVersionDocuments"
    )

    console.log("")
    console.log("mba              v     mba_pdf         media_plan      aa              error")
    console.log("----------------  ----  --------------  --------------  --------------  -----")

    let errors = 0
    for (let i = 0; i < missingFiles.length; i++) {
      const row = missingFiles[i]!
      let mbaPdf = "—"
      let mediaPlan = "—"
      let aa = "—"
      let error = ""
      try {
        const result = await regeneratePlanVersionDocuments({
          versionId: row.versionId,
        })
        if (result.status === "not_found") {
          error = "not_found"
          errors++
        } else if (result.status === "not_published") {
          error = "NOT_PUBLISHED"
          errors++
        } else {
          mbaPdf = statusForKind(result.results, "mba_pdf")
          mediaPlan = statusForKind(result.results, "media_plan")
          aa = statusForKind(result.results, "aa_media_plan")
          if (result.results.some((r) => r.status === "error")) {
            errors++
            error = result.results
              .filter((r) => r.status === "error")
              .map((r) => `${r.kind}:${r.error ?? "error"}`)
              .join("; ")
          }
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        errors++
      }
      console.log(
        `${pad(row.mbaNumber, 16)}  ${pad(row.versionNumber, 4)}  ${pad(mbaPdf, 14)}  ${pad(mediaPlan, 14)}  ${pad(aa, 14)}  ${error || ""}`,
      )
      if (i < missingFiles.length - 1) await sleep(GAP_MS)
    }

    const note = `DOC-2 backfill: ${missingFiles.length} published versions missing files; ${errors} with errors; skipped ${needsPublishedAt.length} published_at-null pointers`
    if (marker) {
      await db
        .update(schema.migrationMarkers)
        .set({ appliedAt: new Date().toISOString(), note })
        .where(eq(schema.migrationMarkers.key, MARKER_KEY))
    } else {
      await db.insert(schema.migrationMarkers).values({
        key: MARKER_KEY,
        note,
      })
    }
    console.log("")
    console.log(`Wrote migration_markers.${MARKER_KEY}. Errors: ${errors}.`)
  } finally {
    await closeDb()
  }
}

main().catch(async (err) => {
  console.error(err)
  try {
    const { closeDb } = await import("@/db")
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
