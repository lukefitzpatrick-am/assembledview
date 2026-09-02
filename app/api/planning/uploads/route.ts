import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/requireRole"
import { capParseForTransport } from "@/lib/planning/upload/capParseForTransport"
import { parseRoyMorganWorkbook } from "@/lib/planning/upload/parseRoyMorganWorkbook"
import { storePlanningUploadBlob } from "@/lib/planning/upload/storePlanningUploadBlob"
import { checkUploadRateLimit } from "@/lib/planning/upload/uploadRateLimit"
import {
  createUpload,
  UploadedAudienceError,
} from "@/lib/planning/upload/uploadedAudienceRepo"
import { validateUploadFile } from "@/lib/planning/upload/validateUploadFile"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

function repoError(error: unknown): NextResponse {
  if (error instanceof UploadedAudienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  console.error("[api/planning/uploads]", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

function pickFile(form: FormData): File | null | "too-many" {
  const named = form.get("file")
  if (named instanceof File) return named
  const files = [...form.values()].filter((v): v is File => v instanceof File)
  if (files.length === 0) return null
  if (files.length > 1) return "too-many"
  return files[0] ?? null
}

/**
 * POST /api/planning/uploads — stage a Roy Morgan workbook (multipart, one file).
 * Gate: admin. Response never includes blob_url / pathname.
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
  const limit = checkUploadRateLimit(String(sessionKey))
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Try again in a minute." },
      { status: 429 }
    )
  }

  const sessionEmail =
    typeof gate.session?.user?.email === "string"
      ? gate.session.user.email.trim()
      : ""
  if (!sessionEmail) {
    return NextResponse.json(
      { error: "uploaded_by_email could not be resolved from session" },
      { status: 400 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Body must be multipart form data with one file" },
      { status: 400 }
    )
  }

  const picked = pickFile(form)
  if (picked === "too-many") {
    return NextResponse.json(
      { error: "Exactly one file is required" },
      { status: 400 }
    )
  }
  const reason = validateUploadFile(
    picked ? { name: picked.name, size: picked.size } : null
  )
  if (reason) {
    return NextResponse.json({ error: reason }, { status: 400 })
  }
  const file = picked as File
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 })
  }

  let parse
  try {
    parse = await parseRoyMorganWorkbook(bytes, file.name)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Could not parse workbook: ${message}` },
      { status: 400 }
    )
  }

  let blobUrl: string | null = null
  try {
    blobUrl = await storePlanningUploadBlob(file.name, bytes)
  } catch (error) {
    console.error("[api/planning/uploads] blob put failed; storing parse_json with blob_url null", error)
  }

  const first = parse.sheets[0]
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  try {
    const row = await createUpload({
      fileName: file.name,
      blobUrl,
      byteSize: bytes.length,
      waveCode: first?.waveCode ?? null,
      surveyPeriod: first?.surveyPeriod ?? null,
      filterLabel: first?.filter ?? null,
      parseJson: parse,
      uploadedByEmail: sessionEmail,
      expiresAt,
    })
    const capped = capParseForTransport(parse)
    return NextResponse.json({
      upload_id: row.id,
      parse: capped.parse,
      cap_hit: capped.cap_hit,
    })
  } catch (error) {
    return repoError(error)
  }
}
