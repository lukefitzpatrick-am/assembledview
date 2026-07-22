import { NextRequest, NextResponse } from "next/server"

import {
  generateNamingWorkbookFromPostedPlan,
  parseNamingGenerateBody,
} from "@/lib/naming/generateFromPostedPlan"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * Generate naming conventions .xlsx from posted (possibly unsaved) plan state.
 * Auth outside any cache. Does not persist.
 * Publishers + container best-practice are fetched server-side (body override optional).
 */
export async function POST(request: NextRequest) {
  // Auth gate — keep outside any cache / long work.
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  let body
  try {
    body = parseNamingGenerateBody(raw)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid body" },
      { status: 400 },
    )
  }

  try {
    const { buffer, fileName, tokenPath } =
      await generateNamingWorkbookFromPostedPlan(body)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Naming-Tokens": tokenPath,
      },
    })
  } catch (err) {
    console.error("[naming/generate]", err)
    return NextResponse.json(
      {
        error: "Failed to generate naming workbook",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
