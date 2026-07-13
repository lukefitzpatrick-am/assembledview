import { NextRequest, NextResponse } from "next/server"

import { auth0 } from "@/lib/auth0"
import { fetchAllMediaContainerLineItems } from "@/lib/api/media-containers"
import { getUserRoles } from "@/lib/rbac"
import {
  buildMiWorkbook,
  miPayloadFromResolve,
  miWorkbookFilename,
  type MiWorkbookCampaign,
} from "@/lib/specs/buildMiWorkbook"
import { applyAnswers, resolveMiPlan, type MiAnswer, type MiPlanInput } from "@/lib/specs/resolve"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

type ExportBody = {
  answers?: MiAnswer[]
  prepared_by?: string
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function campaignFromLineItems(
  mbaNumber: string,
  lineItems: Record<string, unknown[]>,
  preparedBy?: string,
): MiWorkbookCampaign {
  const first = Object.values(lineItems).flat().find(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)),
  )
  return {
    name: text(first?.campaign_name) || text(first?.mp_campaignname) || mbaNumber,
    client: text(first?.client_name) || text(first?.client) || text(first?.brand) || "Client",
    prepared_by: preparedBy,
    prepared_date: new Date().toISOString().slice(0, 10),
  }
}

async function exportWorkbook(
  request: NextRequest,
  mbaNumber: string,
  body: ExportBody,
): Promise<NextResponse> {
  const session = await auth0.getSession(request)
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 })
  }
  const roles = getUserRoles(session.user)
  if (!roles.includes("admin") && !roles.includes("manager")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const lineItems = await fetchAllMediaContainerLineItems(mbaNumber)
  const plan: MiPlanInput = { lineItems }
  const answers = Array.isArray(body.answers) ? body.answers : []
  const result = answers.length > 0
    ? applyAnswers(plan, answers)
    : resolveMiPlan(plan)
  const campaign = campaignFromLineItems(
    mbaNumber,
    lineItems,
    body.prepared_by || session.user.name || session.user.email || undefined,
  )
  const { workbook } = await buildMiWorkbook({
    ...miPayloadFromResolve(campaign, result),
    answers,
  })
  const buffer = await workbook.xlsx.writeBuffer()
  const filename = miWorkbookFilename(campaign.client, campaign.name)
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> },
) {
  try {
    const { mba_number: mbaNumber } = await params
    if (!mbaNumber.trim()) {
      return NextResponse.json({ error: "MBA number is required" }, { status: 400 })
    }
    return await exportWorkbook(request, mbaNumber, {})
  } catch (error) {
    console.error("GET material instructions export:", error)
    return NextResponse.json({ error: "Failed to build material instructions" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mba_number: string }> },
) {
  try {
    const { mba_number: mbaNumber } = await params
    if (!mbaNumber.trim()) {
      return NextResponse.json({ error: "MBA number is required" }, { status: 400 })
    }
    const body = await request.json().catch(() => ({})) as ExportBody
    return await exportWorkbook(request, mbaNumber, body)
  } catch (error) {
    console.error("POST material instructions export:", error)
    return NextResponse.json({ error: "Failed to build material instructions" }, { status: 500 })
  }
}
