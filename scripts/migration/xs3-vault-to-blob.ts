/**
 * XS-3: copy plan files still on the Xano vault into private Vercel Blob
 * and repoint `media_plan_versions`. App readers stream through `servePlanFile`.
 *
 * Vault download uses `XANO_API_KEY` via `xanoAuthHeader()`. App readers do not.
 * Upload uses `putPrivatePlanDocument` (`access: "private"`, `addRandomSuffix: true`).
 * A verify mismatch deletes the just-uploaded Blob object before the next file.
 *
 *   npm run xs3:vault-to-blob -- --dry-run
 *   npm run xs3:vault-to-blob -- --limit 1 --kind mba_pdf
 *   npm run xs3:vault-to-blob
 *
 * CSV log: tmp/xs3-vault-to-blob.csv
 * `migration_markers` key `xs3_vault_to_blob` is written only when the run
 * covers every kind, has no `--limit`, and finishes with zero failures.
 */
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { del } from "@vercel/blob"
import { eq, or, sql } from "drizzle-orm"

import { closeDb, getDb, schema } from "@/db"
import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"
import { putPrivatePlanDocument } from "@/lib/docs/storePlanVersionDocuments"
import { xanoAuthHeader } from "@/lib/api/xano"
import {
  migratedFromXanoJson,
  parseXs3Args,
  selectVaultWorkItems,
  shouldWriteXs3Marker,
  XS3_FILE_CONCURRENCY,
  XS3_KINDS,
  XS3_MARKER_KEY,
  xs3BlobPathname,
  xs3CsvLine,
  type Xs3Kind,
  type Xs3VersionRow,
  type Xs3WorkItem,
} from "@/lib/docs/xs3VaultToBlob"
import { loadEnvLocal } from "@/scripts/migration/_shared"

loadEnvLocal()

const CSV_PATH = path.resolve(process.cwd(), "tmp/xs3-vault-to-blob.csv")
const CSV_HEADER = "version_id,kind,old_url,new_url,bytes,sha256,status"

const FILE_COLUMN = {
  media_plan: schema.mediaPlanVersions.mediaPlanFile,
  mba_pdf: schema.mediaPlanVersions.mbaPdfFile,
  aa_media_plan: schema.mediaPlanVersions.aaMediaPlanFile,
} as const

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function ensureCsv(): void {
  mkdirSync(path.dirname(CSV_PATH), { recursive: true })
  if (!existsSync(CSV_PATH)) appendFileSync(CSV_PATH, `${CSV_HEADER}\n`)
}

let csvChain: Promise<void> = Promise.resolve()

function logCsv(line: string): Promise<void> {
  csvChain = csvChain.then(() => {
    appendFileSync(CSV_PATH, `${line}\n`)
  })
  return csvChain
}

async function downloadVault(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: xanoAuthHeader() })
  if (!response.ok) {
    throw new Error(`download ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function deleteUploadedBlob(uploaded: { url: string; pathname: string }): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const opts = token ? { token } : {}
  try {
    await del(uploaded.url, opts)
  } catch {
    try {
      await del(uploaded.pathname, opts)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`blob delete failed ${uploaded.url}: ${message}`)
    }
  }
}

async function readBlobBytes(url: string): Promise<{ bytes: Buffer; declaredSize: number | null }> {
  const result = await getPrivateBlob(url)
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`blob readback ${result?.statusCode ?? "missing"}`)
  }
  const bytes = Buffer.from(await new Response(result.stream).arrayBuffer())
  const declared = result.blob?.size
  return {
    bytes,
    declaredSize: typeof declared === "number" ? declared : null,
  }
}

async function writeColumn(item: Xs3WorkItem, json: ReturnType<typeof migratedFromXanoJson>): Promise<void> {
  const db = getDb()
  const patch =
    item.kind === "media_plan"
      ? { mediaPlanFile: json }
      : item.kind === "mba_pdf"
        ? { mbaPdfFile: json }
        : { aaMediaPlanFile: json }
  await db.transaction(async (tx) => {
    await tx
      .update(schema.mediaPlanVersions)
      .set(patch)
      .where(eq(schema.mediaPlanVersions.id, item.versionId))
  })
}

const rowWriteChain = new Map<number, Promise<void>>()

function writeColumnLocked(
  item: Xs3WorkItem,
  json: ReturnType<typeof migratedFromXanoJson>,
): Promise<void> {
  const previous = rowWriteChain.get(item.versionId) ?? Promise.resolve()
  const next = previous.then(() => writeColumn(item, json))
  rowWriteChain.set(item.versionId, next)
  return next
}

async function processFile(item: Xs3WorkItem, dryRun: boolean): Promise<"ok" | "failed"> {
  let downloaded: Buffer
  try {
    downloaded = await downloadVault(item.url)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logCsv(
      xs3CsvLine({
        versionId: item.versionId,
        kind: item.kind,
        oldUrl: item.url,
        newUrl: "",
        bytes: "",
        sha256: "",
        status: `failed ${message}`,
      }),
    )
    console.error(`fail ${item.versionId} ${item.kind}: ${message}`)
    return "failed"
  }

  const digest = sha256Hex(downloaded)
  if (dryRun) {
    await logCsv(
      xs3CsvLine({
        versionId: item.versionId,
        kind: item.kind,
        oldUrl: item.url,
        newUrl: "",
        bytes: downloaded.length,
        sha256: digest,
        status: "dry-run",
      }),
    )
    return "ok"
  }

  const pathname = xs3BlobPathname(item.mbaNumber, item.versionNumber, item.kind, item.name)
  try {
    const uploaded = await putPrivatePlanDocument(pathname, downloaded, item.mime)
    const readback = await readBlobBytes(uploaded.url)
    const readbackDigest = sha256Hex(readback.bytes)
    const sizeMatches =
      readback.bytes.length === downloaded.length &&
      (readback.declaredSize == null || readback.declaredSize === downloaded.length)
    if (!sizeMatches || readbackDigest !== digest) {
      await deleteUploadedBlob(uploaded)
      throw new Error(
        `verify mismatch size ${downloaded.length}/${readback.bytes.length} declared ${readback.declaredSize ?? "n/a"}`,
      )
    }
    const json = migratedFromXanoJson({
      url: uploaded.url,
      pathname: uploaded.pathname,
      name: item.name,
      size: downloaded.length,
      mime: item.mime,
      xanoUrl: item.url,
    })
    await writeColumnLocked(item, json)
    await logCsv(
      xs3CsvLine({
        versionId: item.versionId,
        kind: item.kind,
        oldUrl: item.url,
        newUrl: uploaded.url,
        bytes: downloaded.length,
        sha256: digest,
        status: "migrated",
      }),
    )
    return "ok"
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logCsv(
      xs3CsvLine({
        versionId: item.versionId,
        kind: item.kind,
        oldUrl: item.url,
        newUrl: "",
        bytes: downloaded.length,
        sha256: digest,
        status: `failed ${message}`,
      }),
    )
    console.error(`fail ${item.versionId} ${item.kind}: ${message}`)
    return "failed"
  }
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      await fn(items[index]!)
    }
  })
  await Promise.all(workers)
}

async function loadRows(kinds: readonly Xs3Kind[]): Promise<Xs3VersionRow[]> {
  const db = getDb()
  const matches = kinds.map(
    (kind) => sql`(${FILE_COLUMN[kind]}->>'url') ILIKE '%xano.io%'`,
  )
  const where = matches.length === 1 ? matches[0]! : or(...matches)
  return db
    .select({
      id: schema.mediaPlanVersions.id,
      versionNumber: schema.mediaPlanVersions.versionNumber,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
      mediaPlanFile: schema.mediaPlanVersions.mediaPlanFile,
      mbaPdfFile: schema.mediaPlanVersions.mbaPdfFile,
      aaMediaPlanFile: schema.mediaPlanVersions.aaMediaPlanFile,
    })
    .from(schema.mediaPlanVersions)
    .where(where)
    .orderBy(schema.mediaPlanVersions.id)
}

async function writeMarker(migrated: number): Promise<void> {
  const db = getDb()
  const note = `XS-3 vault copy: ${migrated} files migrated, 0 failures`
  const existing = await db
    .select({ key: schema.migrationMarkers.key })
    .from(schema.migrationMarkers)
    .where(eq(schema.migrationMarkers.key, XS3_MARKER_KEY))
    .limit(1)
  if (existing.length > 0) {
    await db
      .update(schema.migrationMarkers)
      .set({ appliedAt: new Date().toISOString(), note })
      .where(eq(schema.migrationMarkers.key, XS3_MARKER_KEY))
    return
  }
  await db.insert(schema.migrationMarkers).values({ key: XS3_MARKER_KEY, note })
}

async function main(): Promise<void> {
  const args = parseXs3Args(process.argv.slice(2))
  const kinds: readonly Xs3Kind[] = args.kind ? [args.kind] : XS3_KINDS
  ensureCsv()

  const rows = await loadRows(kinds)
  const items = rows.flatMap((row) => selectVaultWorkItems(row, kinds))
  const work = args.limit == null ? items : items.slice(0, args.limit)
  console.log(
    `XS-3 ${args.dryRun ? "dry-run" : "apply"}: ${rows.length} rows, ${items.length} vault files, processing ${work.length} at concurrency ${XS3_FILE_CONCURRENCY}`,
  )

  let failures = 0
  let migrated = 0
  await mapPool(work, XS3_FILE_CONCURRENCY, async (item) => {
    if (!item.mbaNumber.trim() || !Number.isInteger(item.versionNumber)) {
      failures += 1
      await logCsv(
        xs3CsvLine({
          versionId: item.versionId,
          kind: item.kind,
          oldUrl: item.url,
          newUrl: "",
          bytes: "",
          sha256: "",
          status: "failed missing mba_number or version_number",
        }),
      )
      return
    }
    const result = await processFile(item, args.dryRun)
    if (result === "failed") failures += 1
    else if (!args.dryRun) migrated += 1
  })
  await csvChain

  if (shouldWriteXs3Marker(args, failures)) {
    await writeMarker(migrated)
    console.log(`Wrote migration_markers ${XS3_MARKER_KEY}.`)
  } else {
    console.log("No migration_markers write (dry-run, --limit, --kind, or failures).")
  }
  console.log(`Done. migrated ${args.dryRun ? 0 : migrated}, failures ${failures}. Log ${CSV_PATH}`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDb()
  })
