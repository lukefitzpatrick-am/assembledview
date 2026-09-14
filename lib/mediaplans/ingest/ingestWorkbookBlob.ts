/**
 * Private Vercel Blob bytes for a staged ingest workbook (IG-14 / C-101).
 * Path: ingest/{stageId}/{filename}. Pointer jsonb is ingest_stages.source_file.
 */
import { createHash } from "node:crypto"
import { del, put } from "@vercel/blob"
import { getPrivateBlob } from "@/lib/creative/getPrivateBlob"

export const INGEST_XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export type IngestSourceFile = {
  url: string
  pathname: string
  name: string
  size: number
  mime: string
  uploadedAt: string
  sha256: string
}

const memoryBlobs = new Map<string, Buffer>()

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

function basename(filename: string): string {
  const trimmed = filename.replace(/\\/g, "/").trim()
  const parts = trimmed.split("/")
  const last = parts[parts.length - 1]?.trim()
  return last && last !== "." && last !== ".." ? last : "workbook.xlsx"
}

export function ingestWorkbookPathname(stageId: string, filename: string): string {
  return `ingest/${stageId.trim()}/${basename(filename)}`
}

function mimeForName(filename: string, mime?: string | null): string {
  if (typeof mime === "string" && mime.trim()) return mime.trim()
  const lower = filename.toLowerCase()
  if (lower.endsWith(".xlsm")) {
    return "application/vnd.ms-excel.sheet.macroEnabled.12"
  }
  if (lower.endsWith(".xlsx")) return INGEST_XLSX_MIME
  return "application/octet-stream"
}

function isMemoryBlobStore(): boolean {
  return (
    process.env.NODE_TEST_CONTEXT != null ||
    process.env.INGEST_BLOB_STORE === "memory"
  )
}

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined
}

export function parseIngestSourceFile(raw: unknown): IngestSourceFile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (typeof o.url !== "string" || !o.url.trim()) return null
  if (typeof o.pathname !== "string" || !o.pathname.trim()) return null
  if (typeof o.name !== "string" || !o.name.trim()) return null
  if (typeof o.sha256 !== "string" || !o.sha256.trim()) return null
  const size = typeof o.size === "number" && Number.isFinite(o.size) ? o.size : null
  if (size == null || size < 0) return null
  if (typeof o.mime !== "string" || !o.mime.trim()) return null
  if (typeof o.uploadedAt !== "string" || !o.uploadedAt.trim()) return null
  return {
    url: o.url.trim(),
    pathname: o.pathname.trim(),
    name: o.name.trim(),
    size,
    mime: o.mime.trim(),
    uploadedAt: o.uploadedAt.trim(),
    sha256: o.sha256.trim(),
  }
}

export function ingestWorkbookBlobExistsForTests(pathname: string): boolean {
  return memoryBlobs.has(pathname)
}

export function clearIngestWorkbookBlobsForTests(): void {
  memoryBlobs.clear()
}

export async function putIngestWorkbook(args: {
  stageId: string
  fileName: string | null
  buffer: Buffer
  mime?: string | null
}): Promise<IngestSourceFile> {
  const name = basename(args.fileName ?? "workbook.xlsx")
  const pathname = ingestWorkbookPathname(args.stageId, name)
  const mime = mimeForName(name, args.mime)
  const uploadedAt = new Date().toISOString()
  const sha256 = sha256Hex(args.buffer)

  if (isMemoryBlobStore()) {
    memoryBlobs.set(pathname, Buffer.from(args.buffer))
    return {
      url: `https://blob.test/${pathname}`,
      pathname,
      name,
      size: args.buffer.byteLength,
      mime,
      uploadedAt,
      sha256,
    }
  }

  const token = blobToken()
  const blob = await put(pathname, args.buffer, {
    access: "private",
    addRandomSuffix: false,
    contentType: mime,
    ...(token ? { token } : {}),
  })
  return {
    url: blob.url,
    pathname: blob.pathname,
    name,
    size: args.buffer.byteLength,
    mime,
    uploadedAt,
    sha256,
  }
}

async function bufferFromPrivateGet(
  result: Awaited<ReturnType<typeof getPrivateBlob>>,
): Promise<Buffer | null> {
  if (!result || result.statusCode !== 200 || !result.stream) return null
  return Buffer.from(await new Response(result.stream).arrayBuffer())
}

export async function getIngestWorkbookBuffer(
  sourceFile: IngestSourceFile,
): Promise<Buffer | null> {
  const mem =
    memoryBlobs.get(sourceFile.pathname) ?? memoryBlobs.get(sourceFile.url)
  if (mem) return Buffer.from(mem)

  const fromUrl = await bufferFromPrivateGet(await getPrivateBlob(sourceFile.url))
  if (fromUrl) return fromUrl
  return bufferFromPrivateGet(await getPrivateBlob(sourceFile.pathname))
}

export async function deleteIngestWorkbook(
  sourceFile: IngestSourceFile | null | undefined,
): Promise<void> {
  if (!sourceFile) return
  memoryBlobs.delete(sourceFile.pathname)
  memoryBlobs.delete(sourceFile.url)
  if (isMemoryBlobStore()) return
  const token = blobToken()
  try {
    await del(sourceFile.url, token ? { token } : {})
  } catch {
    try {
      await del(sourceFile.pathname, token ? { token } : {})
    } catch {
      // blob already gone
    }
  }
}
