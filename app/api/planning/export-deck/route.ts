import { NextRequest, NextResponse } from "next/server"
import {
  buildPlannerDeck,
  type PlannerDeckInput,
} from "@/lib/planning/export/buildPlannerDeck"
import { checkExportDeckRateLimit } from "@/lib/planning/exportDeckRateLimit"
import { requireRole } from "@/lib/requireRole"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_IMAGES = 8
const STR_CAP = 500

function badRequest(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 })
}

function asString(value: unknown, max = STR_CAP): string | undefined {
  if (value == null) return undefined
  const s = String(value).trim()
  if (!s) return undefined
  return s.length <= max ? s : s.slice(0, max)
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function validatePngDataUrl(value: unknown, label: string): string | null {
  if (value == null || value === "") return null
  if (typeof value !== "string") {
    throw new Error(`${label} must be a PNG data URL string`)
  }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim())
  if (!m) {
    throw new Error(`${label} must be image/png data URL`)
  }
  const b64 = m[1]!.replace(/\s/g, "")
  const bytes = Math.floor((b64.length * 3) / 4)
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error(`${label} exceeds 2MB`)
  }
  return value.trim()
}

function parseBody(raw: unknown): PlannerDeckInput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Body must be a JSON object")
  }
  const body = raw as Record<string, unknown>
  const briefRaw = (body.brief ?? {}) as Record<string, unknown>
  const diagnosisRaw = (body.diagnosis ?? {}) as Record<string, unknown>
  const constraintsRaw = (body.constraintsSummary ?? {}) as Record<string, unknown>
  const audiencesRaw = body.audiences

  if (!Array.isArray(audiencesRaw) || audiencesRaw.length === 0) {
    throw new Error("audiences must be a non-empty array")
  }
  if (audiencesRaw.length > 3) {
    throw new Error("At most 3 audiences")
  }

  let imageCount = 0
  const countImage = (v: string | null) => {
    if (v) imageCount += 1
  }

  const audiences = audiencesRaw.map((a, i) => {
    if (!a || typeof a !== "object") throw new Error(`audience[${i}] invalid`)
    const row = a as Record<string, unknown>
    const chartsRaw = (row.charts ?? {}) as Record<string, unknown>
    const reachIndexPng = validatePngDataUrl(
      chartsRaw.reachIndexPng,
      `audiences[${i}].charts.reachIndexPng`
    )
    const quadrantPng = validatePngDataUrl(
      chartsRaw.quadrantPng,
      `audiences[${i}].charts.quadrantPng`
    )
    const dfiiPng = validatePngDataUrl(
      chartsRaw.dfiiPng,
      `audiences[${i}].charts.dfiiPng`
    )
    countImage(reachIndexPng)
    countImage(quadrantPng)
    countImage(dfiiPng)
    return {
      name: asString(row.name, 120) || `Audience ${i + 1}`,
      definition: asString(row.definition, 400) || "—",
      stats: asString(row.stats, 400) || "—",
      insight: asString(row.insight, 4000) ?? null,
      topMix: asString(row.topMix, 300) || "—",
      topDfii: asString(row.topDfii, 120) || "—",
      charts: {
        reachIndexPng,
        reachIndexPngWidth: asNumber(chartsRaw.reachIndexPngWidth) ?? null,
        reachIndexPngHeight: asNumber(chartsRaw.reachIndexPngHeight) ?? null,
        quadrantPng,
        quadrantPngWidth: asNumber(chartsRaw.quadrantPngWidth) ?? null,
        quadrantPngHeight: asNumber(chartsRaw.quadrantPngHeight) ?? null,
        dfiiPng,
        dfiiPngWidth: asNumber(chartsRaw.dfiiPngWidth) ?? null,
        dfiiPngHeight: asNumber(chartsRaw.dfiiPngHeight) ?? null,
      },
    }
  })

  const splitTablePng = validatePngDataUrl(body.splitTablePng, "splitTablePng")
  countImage(splitTablePng)
  if (imageCount > MAX_IMAGES) {
    throw new Error(`At most ${MAX_IMAGES} images`)
  }

  const excludedNames = Array.isArray(constraintsRaw.excludedNames)
    ? constraintsRaw.excludedNames
        .map((n) => asString(n, 80))
        .filter((n): n is string => Boolean(n))
    : []

  return {
    brief: {
      clientName: asString(briefRaw.clientName, 120),
      campaignName: asString(briefRaw.campaignName, 160),
      category: asString(briefRaw.category, 120),
      market: asString(briefRaw.market, 80),
      objectiveKind: asString(briefRaw.objectiveKind, 80),
      budget: asNumber(briefRaw.budget),
      startDate: asString(briefRaw.startDate, 40) ?? null,
      endDate: asString(briefRaw.endDate, 40) ?? null,
    },
    diagnosis: {
      penetrationPct: asNumber(diagnosisRaw.penetrationPct) ?? null,
      targetPct: asNumber(diagnosisRaw.targetPct) ?? null,
      salience: asString(diagnosisRaw.salience, 80) ?? null,
      createCapture: asNumber(diagnosisRaw.createCapture) ?? 50,
    },
    constraintsSummary: {
      includedCount: asNumber(constraintsRaw.includedCount) ?? 0,
      excludedNames,
    },
    waveLabel: asString(body.waveLabel, 40) || "—",
    reachBasis: asString(body.reachBasis, 40) || "Addressable",
    audiences,
    splitTablePng,
    splitTablePngWidth: asNumber(body.splitTablePngWidth) ?? null,
    splitTablePngHeight: asNumber(body.splitTablePngHeight) ?? null,
    generatedAtLabel: asString(body.generatedAtLabel, 40) || new Date().toLocaleDateString("en-AU"),
  }
}

function clientSlug(name: string | undefined) {
  const s = (name || "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return s || "client"
}

function yyyymmdd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}`
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, ["admin", "manager"])
  if ("response" in gate) return gate.response

  const sessionKey =
    gate.session?.user?.sub || gate.session?.user?.email || "anonymous"
  const limit = checkExportDeckRateLimit(String(sessionKey))
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many export requests. Try again in a minute.",
      },
      { status: 429 }
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest("Invalid JSON body")
  }

  let input: PlannerDeckInput
  try {
    input = parseBody(raw)
  } catch (err) {
    return badRequest(err instanceof Error ? err.message : "Invalid body")
  }

  try {
    const buf = await buildPlannerDeck(input)
    const filename = `demand-flow-plan-${clientSlug(input.brief.clientName)}-${yyyymmdd()}.pptx`
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("[export-deck]", err)
    return NextResponse.json(
      {
        error: "export_failed",
        message: err instanceof Error ? err.message : "Failed to build deck",
      },
      { status: 502 }
    )
  }
}
