import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/requireRole"
import { persistFieldDefault } from "@/lib/mediaplans/ingest/persistColumnRemap"
import {
  fieldIdFromConstantHeader,
  isConstantMappingHeader,
} from "@/lib/mediaplans/ingest/publisherProfileConfig"
import { remapIngestColumn } from "@/lib/mediaplans/ingest/remapIngestColumn"

export const runtime = "nodejs"

function sessionIdentity(auth: {
  session: { user?: { email?: string | null } } | null | undefined
}): string | null {
  const email = auth.session?.user?.email?.trim()
  if (email) return email
  return null
}

/** Remap a publisher column → writes back to publisher_profiles. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ("response" in auth) {
    return auth.response
  }

  try {
    const changedBy = sessionIdentity(auth)
    if (!changedBy) {
      return NextResponse.json(
        { error: "session identity required — remap cannot be anonymous" },
        { status: 400 },
      )
    }
    const body = (await request.json()) as {
      publisherName?: string
      header?: string
      mappedTo?: string | null
      knownHeaders?: unknown
      stageId?: string | null
      fieldDefault?: { field?: string; value?: string | null } | null
    }
    if (!body.publisherName?.trim()) {
      return NextResponse.json(
        { error: "publisherName required" },
        { status: 400 },
      )
    }
    const fieldDefaultField =
      body.fieldDefault?.field?.trim() ||
      (body.header && isConstantMappingHeader(body.header)
        ? fieldIdFromConstantHeader(body.header).trim()
        : "")
    if (fieldDefaultField) {
      const result = await persistFieldDefault({
        publisherName: body.publisherName.trim(),
        field: fieldDefaultField,
        value:
          body.fieldDefault && "value" in body.fieldDefault
            ? (body.fieldDefault.value ?? null)
            : (body.mappedTo ?? null),
        changedBy,
        source: "hub_remap",
        stageId: body.stageId ?? null,
      })
      if (!result.ok) {
        return NextResponse.json(result, { status: 200 })
      }
      return NextResponse.json(result)
    }
    if (!body.header?.trim()) {
      return NextResponse.json(
        { error: "publisherName and header required" },
        { status: 400 },
      )
    }
    if (!Array.isArray(body.knownHeaders) || body.knownHeaders.length === 0) {
      return NextResponse.json(
        { error: "knownHeaders required" },
        { status: 400 },
      )
    }
    const knownHeaders = body.knownHeaders.filter(
      (h): h is string => typeof h === "string" && h.trim().length > 0,
    )
    if (knownHeaders.length === 0) {
      return NextResponse.json(
        { error: "knownHeaders required" },
        { status: 400 },
      )
    }
    const result = await remapIngestColumn({
      publisherName: body.publisherName.trim(),
      header: body.header.trim(),
      mappedTo: body.mappedTo ?? null,
      knownHeaders,
      changedBy,
      source: "hub_remap",
      stageId: body.stageId ?? null,
    })
    if (!result.ok) {
      return NextResponse.json(result, { status: 200 })
    }
    return NextResponse.json(result)
  } catch (e) {
    console.error("[admin/ingest/remap]", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Remap failed" },
      { status: 500 },
    )
  }
}
