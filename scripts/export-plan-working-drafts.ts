/**
 * Read-only dump of every plan_working_drafts row (full jsonb payload).
 *
 * Writes nothing to the database. Output is gitignored under
 * exports/working-drafts/ — do not commit live client drafts.
 *
 * Usage (from repo root):
 *   npm run drafts:export
 *
 * Recovery path for db/migrations/0071_clear_plan_working_drafts.sql.
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { eq } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

const EXPECTED_MBA = [
  "STRMEA001",
  "PGAAUS015",
  "golf025",
  "hema007",
  "golf026",
  "malay004",
  "hartm015",
  "glenda006",
  "krusty001",
] as const

type DraftExportObject = {
  mba_number: string
  master_id: number
  created_at: string
  updated_at: string
  id: number
  user_id: string
  user_label: string | null
  base_version_id: number | null
  draft_state_json: unknown
}

function utf8Bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8")
}

function stampForFilename(iso: string): string {
  return iso.replace(/[:.]/g, "").replace(/Z$/, "Z")
}

async function main(): Promise<void> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.planWorkingDrafts.id,
      createdAt: schema.planWorkingDrafts.createdAt,
      updatedAt: schema.planWorkingDrafts.updatedAt,
      masterId: schema.planWorkingDrafts.masterId,
      userId: schema.planWorkingDrafts.userId,
      userLabel: schema.planWorkingDrafts.userLabel,
      baseVersionId: schema.planWorkingDrafts.baseVersionId,
      draftStateJson: schema.planWorkingDrafts.draftStateJson,
      mbaNumber: schema.mediaPlanMasters.mbaNumber,
      campaignStatus: schema.mediaPlanMasters.campaignStatus,
    })
    .from(schema.planWorkingDrafts)
    .innerJoin(
      schema.mediaPlanMasters,
      eq(schema.planWorkingDrafts.masterId, schema.mediaPlanMasters.id),
    )
    .orderBy(schema.mediaPlanMasters.mbaNumber, schema.planWorkingDrafts.userId)

  const drafts: DraftExportObject[] = rows.map((r) => ({
    mba_number: r.mbaNumber,
    master_id: r.masterId,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    id: r.id,
    user_id: r.userId,
    user_label: r.userLabel,
    base_version_id: r.baseVersionId,
    draft_state_json: r.draftStateJson,
  }))

  const exportedAt = new Date().toISOString()
  const envelope = {
    exported_at: exportedAt,
    source: "plan_working_drafts",
    writes: "none",
    row_count: drafts.length,
    drafts,
  }

  const outDir = join(process.cwd(), "exports", "working-drafts")
  mkdirSync(outDir, { recursive: true })
  const outPath = join(
    outDir,
    `plan_working_drafts-${stampForFilename(exportedAt)}.json`,
  )
  const fileJson = `${JSON.stringify(envelope, null, 2)}\n`
  writeFileSync(outPath, fileJson, "utf8")

  console.log(`wrote ${outPath}`)
  console.log(`file_bytes=${Buffer.byteLength(fileJson, "utf8")}`)
  console.log(`row_count=${drafts.length}`)
  console.log("")
  console.log(
    [
      "mba_number".padEnd(12),
      "master_id".padStart(10),
      "bytes".padStart(8),
      "payload".padStart(8),
      "status".padEnd(12),
      "updated_at",
    ].join("  "),
  )
  for (let i = 0; i < drafts.length; i++) {
    const obj = drafts[i]
    const row = rows[i]
    const objectBytes = utf8Bytes(obj)
    const payloadBytes = utf8Bytes(obj.draft_state_json)
    console.log(
      [
        obj.mba_number.padEnd(12),
        String(obj.master_id).padStart(10),
        String(objectBytes).padStart(8),
        String(payloadBytes).padStart(8),
        String(row.campaignStatus ?? "").padEnd(12),
        obj.updated_at,
      ].join("  "),
    )
  }

  const expectedSet = new Set(EXPECTED_MBA.map((m) => m.toLowerCase()))
  const foundMba = new Set(drafts.map((d) => d.mba_number.toLowerCase()))
  const missing = EXPECTED_MBA.filter((m) => !foundMba.has(m.toLowerCase()))
  const extra = [...foundMba].filter((m) => !expectedSet.has(m))
  const distinctMasters = new Set(drafts.map((d) => d.master_id))

  if (missing.length > 0) {
    console.warn(`missing expected mba_number: ${missing.join(", ")}`)
  }
  if (extra.length > 0) {
    console.warn(`unexpected mba_number: ${extra.join(", ")}`)
  }
  if (distinctMasters.size !== drafts.length) {
    console.warn(
      `distinct master_id=${distinctMasters.size} vs rows=${drafts.length} (more than one user per master)`,
    )
  }

  if (drafts.length !== 9) {
    throw new Error(
      `expected 9 plan_working_drafts rows, found ${drafts.length} — file written; do not author 0071 until this matches`,
    )
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb().catch(() => undefined)
  })
