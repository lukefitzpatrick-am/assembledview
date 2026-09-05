/**
 * Backfill MBA PDF / media plan / AA workbooks for published versions that
 * have published_at set but are missing one or more file jsonb columns.
 *
 * Calls regeneratePlanVersionDocuments (the same service as
 * POST /api/mediaplans/versions/[id]/documents/regenerate). Never mutates
 * approved_slice, published_at, schedule_months, or line items.
 *
 * `--out <dir>` with `--mba` and `--version` writes the selected kinds to disk
 * and makes no Blob upload and no Postgres write. The selected version may
 * be a historic published cut (not the master's published_version_id);
 * isVersionPublished still gates generate.
 * `--kinds media_plan,aa_media_plan,mba_pdf` defaults to all three.
 * `--apply` writes one `migration_markers` row per kind
 * (`doc2_plan_documents_backfill:<kind>`), so an Excel apply does not block
 * a later `--kinds mba_pdf` run.
 *
 * Usage:
 *   npm run docs:backfill              # dry-run (default)
 *   npm run docs:backfill -- --apply
 *   npm run docs:backfill -- --mba glenda008
 *   npm run docs:backfill -- --kinds mba_pdf
 *   npm run docs:backfill -- --out tmp/parity --mba PENFOLD001 --version 16
 *   npm run docs:backfill -- --apply --force
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"

import {
  BACKFILL_PLAN_DOCUMENTS_MARKER_PREFIX,
  backfillKindsNotYetMarked,
  backfillPlanDocumentsMarkerKey,
  countMissingByKind,
  missingRequestedKinds,
  parseBackfillPlanDocumentsArgs,
  planDocumentOutFilenames,
  storedPlanDocumentOutFilenames,
} from "@/lib/docs/backfillPlanDocumentsArgs"
import { parsePlanFileJson, PLAN_DOCUMENT_KINDS, type PlanDocumentKind } from "@/lib/docs/planVersionFiles"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

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

function missingKinds(
  row: Candidate,
  kinds: PlanDocumentKind[],
): PlanDocumentKind[] {
  return missingRequestedKinds(
    {
      mba_pdf: row.mbaPdfFile,
      media_plan: row.mediaPlanFile,
      aa_media_plan: row.aaMediaPlanFile,
    },
    kinds,
  )
}

function pad(value: unknown, width: number): string {
  return String(value ?? "").padEnd(width)
}

function printCandidateList(rows: Candidate[], kinds: PlanDocumentKind[]) {
  console.log("mba              v     version_id  missing")
  console.log("----------------  ----  ----------  --------------------------------")
  for (const row of rows) {
    console.log(
      `${pad(row.mbaNumber, 16)}  ${pad(row.versionNumber, 4)}  ${pad(row.versionId, 10)}  ${missingKinds(row, kinds).join(", ")}`,
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

function isVercelBlobUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith("vercel-storage.com") || host.endsWith("blob.vercel-storage.com")
  } catch {
    return false
  }
}

async function fetchStoredPlanFile(
  file: unknown,
  publishedAt: string | null,
): Promise<Buffer | null> {
  const parsed = parsePlanFileJson(file, publishedAt)
  if (!parsed) return null
  const obj =
    file && typeof file === "object" && !Array.isArray(file)
      ? (file as Record<string, unknown>)
      : null
  const pathname =
    typeof obj?.pathname === "string" &&
    obj.pathname.trim() &&
    !obj.pathname.trim().startsWith("http")
      ? obj.pathname.trim()
      : null
  const blobTarget = pathname ?? (isVercelBlobUrl(parsed.url) ? parsed.url : null)
  if (blobTarget) {
    const { getPrivateBlob } = await import("@/lib/creative/getPrivateBlob")
    const blobResult = await getPrivateBlob(blobTarget)
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) return null
    const bytes = await new Response(blobResult.stream).arrayBuffer()
    return Buffer.from(bytes)
  }
  const upstream = await fetch(parsed.url)
  if (!upstream.ok) return null
  return Buffer.from(await upstream.arrayBuffer())
}

async function writeOutDocuments(args: {
  mba: string
  version: number
  outDir: string
  kinds: PlanDocumentKind[]
}) {
  const { closeDb, getDb, schema } = await import("@/db")
  const db = getDb()
  try {
    const [row] = await db
      .select({
        versionId: schema.mediaPlanVersions.id,
        versionNumber: schema.mediaPlanVersions.versionNumber,
        mbaNumber: schema.mediaPlanMasters.mbaNumber,
        publishedAt: schema.mediaPlanVersions.publishedAt,
        mbaPdfFile: schema.mediaPlanVersions.mbaPdfFile,
        mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
        aaMediaPlanFile: schema.mediaPlanVersions.aaMediaPlanFile,
      })
      .from(schema.mediaPlanMasters)
      .innerJoin(
        schema.mediaPlanVersions,
        eq(schema.mediaPlanVersions.masterId, schema.mediaPlanMasters.id),
      )
      .where(
        and(
          sql`lower(trim(${schema.mediaPlanMasters.mbaNumber})) = ${args.mba.toLowerCase()}`,
          eq(schema.mediaPlanVersions.versionNumber, args.version),
        ),
      )
      .limit(1)

    if (!row) {
      console.error(`No version ${args.mba} v${args.version}`)
      process.exitCode = 1
      return
    }
    if (!isVersionPublished({ publishedAt: row.publishedAt })) {
      console.error(
        `NOT_PUBLISHED: ${row.mbaNumber} v${row.versionNumber} has no published_at (isVersionPublished holds; not bypassed)`,
      )
      process.exitCode = 1
      return
    }

    const { renderPlanVersionDocuments } = await import(
      "@/lib/docs/renderPlanVersionDocuments"
    )
    const rendered = await renderPlanVersionDocuments({
      mbaNumber: row.mbaNumber,
      versionNumber: row.versionNumber,
      kinds: args.kinds,
      now: row.publishedAt ? new Date(row.publishedAt) : new Date(),
    })
    if (rendered.status === "not_published") {
      console.error("NOT_PUBLISHED")
      process.exitCode = 1
      return
    }

    mkdirSync(args.outDir, { recursive: true })
    const names = planDocumentOutFilenames(row.mbaNumber, row.versionNumber)
    const storedNames = storedPlanDocumentOutFilenames(
      row.mbaNumber,
      row.versionNumber,
    )
    const storedFiles: Record<PlanDocumentKind, unknown> = {
      mba_pdf: row.mbaPdfFile,
      media_plan: row.mediaPlanFile,
      aa_media_plan: row.aaMediaPlanFile,
    }

    console.log(
      `OUT ${args.outDir}  ${row.mbaNumber} v${row.versionNumber}  version_id=${row.versionId}  kinds=${args.kinds.join(",")}  (no Blob, no Postgres)`,
    )
    console.log("kind            status          from        file")
    console.log("--------------  --------------  ----------  --------------------------------")

    let errors = 0
    for (const result of rendered.results) {
      const file = rendered.files[result.kind]
      let path = ""
      if (file && result.status === "written") {
        path = join(args.outDir, names[result.kind])
        writeFileSync(path, file.buffer)
      } else if (result.status === "error") {
        errors++
      }
      console.log(
        `${pad(result.kind, 14)}  ${pad(result.status, 14)}  ${pad(rendered.generatedFrom[result.kind] ?? "", 10)}  ${path || result.error || ""}`,
      )
    }

    console.log("")
    console.log("stored originals (Xano / Blob url):")
    for (const kind of args.kinds) {
      const dest = join(args.outDir, storedNames[kind])
      try {
        const buf = await fetchStoredPlanFile(storedFiles[kind], row.publishedAt)
        if (!buf) {
          console.log(`${pad(kind, 14)}  not_saved`)
          continue
        }
        writeFileSync(dest, buf)
        console.log(`${pad(kind, 14)}  wrote ${dest}`)
      } catch (err) {
        console.log(
          `${pad(kind, 14)}  error:${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    if (errors > 0) process.exitCode = 1
  } finally {
    await closeDb()
  }
}

async function main() {
  const parsed = parseBackfillPlanDocumentsArgs(process.argv.slice(2))

  if (parsed.outDir) {
    if (!parsed.mba || parsed.version == null) {
      console.error("--out requires --mba <n> and --version <n>")
      process.exitCode = 1
      return
    }
    await writeOutDocuments({
      mba: parsed.mba,
      version: parsed.version,
      outDir: parsed.outDir,
      kinds: parsed.kinds,
    })
    return
  }

  const { closeDb, getDb, schema } = await import("@/db")
  const { apply, force, mba, kinds: requestedKinds } = parsed
  const db = getDb()

  try {
    const markerRows = await db
      .select()
      .from(schema.migrationMarkers)
      .where(
        inArray(schema.migrationMarkers.key, [
          BACKFILL_PLAN_DOCUMENTS_MARKER_PREFIX,
          ...PLAN_DOCUMENT_KINDS.map(backfillPlanDocumentsMarkerKey),
        ]),
      )
    const markerKeys = markerRows.map((row) => row.key)
    const kindsToApply = backfillKindsNotYetMarked({
      kinds: requestedKinds,
      markerKeys,
      force,
    })

    if (apply && kindsToApply.length === 0) {
      const listed = requestedKinds
        .map((kind) => backfillPlanDocumentsMarkerKey(kind))
        .join(", ")
      console.error(
        `Refusing: migration_markers already record ${listed}. Pass --force to re-run those kinds.`,
      )
      process.exitCode = 1
      return
    }

    const kinds = apply ? kindsToApply : requestedKinds

    const filter = mba
      ? sql`lower(trim(${schema.mediaPlanMasters.mbaNumber})) = ${mba.toLowerCase()}`
      : undefined
    const publishedPointer = eq(
      schema.mediaPlanMasters.publishedVersionId,
      schema.mediaPlanVersions.id,
    )
    const columnForKind = {
      mba_pdf: schema.mediaPlanVersions.mbaPdfFile,
      media_plan: schema.mediaPlanVersions.mediaPlanFile,
      aa_media_plan: schema.mediaPlanVersions.aaMediaPlanFile,
    } as const
    const missingClauses = kinds.map((kind) => isNull(columnForKind[kind]))
    const fileMissing =
      missingClauses.length === 1
        ? missingClauses[0]!
        : or(...missingClauses)
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

    const kindsLabel = ` --kinds ${requestedKinds.join(",")}`
    console.log(
      apply
        ? `APPLY${force ? " --force" : ""}${mba ? ` --mba ${mba}` : ""}${kindsLabel}`
        : `DRY-RUN${mba ? ` --mba ${mba}` : ""}${kindsLabel} (pass --apply to write Blob + jsonb)`,
    )
    if (apply && kindsToApply.length !== requestedKinds.length) {
      const skipped = requestedKinds.filter((kind) => !kindsToApply.includes(kind))
      console.log(
        `Skipping already-marked kinds: ${skipped.map(backfillPlanDocumentsMarkerKey).join(", ")}`,
      )
    }
    console.log("")
    const missingCounts = countMissingByKind(
      missingFiles.map((row) => ({
        mba_pdf: row.mbaPdfFile,
        media_plan: row.mediaPlanFile,
        aa_media_plan: row.aaMediaPlanFile,
      })),
      kinds,
    )
    console.log("Missing by kind:")
    for (const kind of kinds) {
      console.log(`  ${pad(kind, 16)}  ${missingCounts[kind]}`)
    }
    console.log("")
    console.log(
      `Published versions missing at least one requested kind (${missingFiles.length}):`,
    )
    if (missingFiles.length === 0) {
      console.log("  (none)")
    } else {
      printCandidateList(missingFiles, kinds)
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
          kinds,
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

    const appliedAt = new Date().toISOString()
    const writtenKeys: string[] = []
    for (const kind of kindsToApply) {
      const key = backfillPlanDocumentsMarkerKey(kind)
      const note = `DOC-2 backfill kind=${kind}: ${missingFiles.length} published versions missing files; ${errors} with errors; skipped ${needsPublishedAt.length} published_at-null pointers`
      const existing = markerRows.find((row) => row.key === key)
      if (existing) {
        await db
          .update(schema.migrationMarkers)
          .set({ appliedAt, note })
          .where(eq(schema.migrationMarkers.key, key))
      } else {
        await db.insert(schema.migrationMarkers).values({ key, note })
      }
      writtenKeys.push(key)
    }
    console.log("")
    console.log(`Wrote migration_markers ${writtenKeys.join(", ")}. Errors: ${errors}.`)
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
