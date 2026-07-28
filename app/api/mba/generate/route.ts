import { NextRequest, NextResponse } from "next/server"
import axios from "axios"
import { format } from "date-fns"
import { generateMBA, MBAData } from "@/lib/generateMBA"
import { addGst } from "@/lib/finance/gst"
import { requireRole } from "@/lib/requireRole"
import { getXanoBaseUrl, parseXanoListPayload, xanoAuthHeaderRecord } from "@/lib/api/xano"
import { getCachedClients } from "@/lib/finance/xanoReferenceCache"
import { buildMbaDataFromPersistedVersion } from "@/lib/finance/buildMbaDataFromPersistedVersion"
import { versionCarriesMbaApproval } from "@/lib/finance/mbaApprovalGate"
import { readFeeSnapshot } from "@/lib/finance/feeSnapshots"
import { resolvePlanCDocsFromPersistedMode } from "@/lib/finance/planCDocsFromPersisted"
import { attachPlanRowSchedulesForSurface } from "@/lib/finance/rows/attachPlanRowSchedules"
import { resolveMbaClientAddress } from "@/lib/finance/rows/resolveMbaClientAddress"
import { resolvePlanCReadRowsMode } from "@/lib/finance/rows/readFlags"

const MEDIA_PLANS_ENV_KEYS = ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"] as const
const XANO_TIMEOUT_MS = 15_000

function pickVersionRow(rows: unknown[], versionNumber: number): Record<string, unknown> | null {
  const list = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
  const exact = list.find((r) => Number(r.version_number) === versionNumber)
  return exact ?? null
}

async function loadMediaPlanMaster(
  mbaNumber: string,
  baseUrl: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await axios.get(`${baseUrl}/media_plan_master`, {
      params: { mba_number: mbaNumber, page: 1, per_page: 5 },
      headers: xanoAuthHeaderRecord(),
      timeout: XANO_TIMEOUT_MS,
      validateStatus: (s) => s >= 200 && s < 500,
    })
    if (response.status >= 400) return null
    const rows = parseXanoListPayload(response.data)
    const first = rows.find((r): r is Record<string, unknown> => !!r && typeof r === "object")
    return first ?? null
  } catch {
    return null
  }
}

async function loadMediaPlanVersion(args: {
  mbaNumber: string
  versionNumber: number
  baseUrl: string
}): Promise<Record<string, unknown> | null> {
  const response = await axios.get(`${args.baseUrl}/media_plan_versions`, {
    params: {
      mba_number: args.mbaNumber,
      version_number: args.versionNumber,
      page: 1,
      per_page: 50,
    },
    headers: xanoAuthHeaderRecord(),
    timeout: XANO_TIMEOUT_MS,
    validateStatus: (s) => s >= 200 && s < 500,
  })
  if (response.status >= 400) {
    console.warn("[mba/generate] version GET failed", {
      status: response.status,
      mba: args.mbaNumber,
      version: args.versionNumber,
    })
    return null
  }
  const rows = parseXanoListPayload(response.data)
  return pickVersionRow(rows, args.versionNumber)
}

function legacyMbaDataFromBody(body: Record<string, unknown>): MBAData {
  const mbaNumber = String(body.mba_number || body.mbanumber || "")
  const exGst = Number(body.totalInvestment) || 0
  return {
    date: format(new Date(), "dd/MM/yyyy"),
    mba_number: mbaNumber,
    campaign_name: String(body.mp_campaignname ?? ""),
    campaign_brand: String(body.mp_brand ?? ""),
    po_number: String(body.mp_ponumber ?? ""),
    media_plan_version: String(body.mp_plannumber ?? ""),
    client: {
      name: String(body.mp_client_name ?? ""),
      streetaddress: String(body.clientAddress ?? ""),
      suburb: String(body.clientSuburb ?? ""),
      state: String(body.clientState ?? ""),
      postcode: String(body.clientPostcode ?? ""),
    },
    campaign: {
      date_start: format(new Date(String(body.mp_campaigndates_start)), "dd/MM/yyyy"),
      date_end: format(new Date(String(body.mp_campaigndates_end)), "dd/MM/yyyy"),
    },
    gross_media: (Array.isArray(body.gross_media) ? body.gross_media : []) as MBAData["gross_media"],
    totals: {
      gross_media: Number(body.grossMediaTotal) || 0,
      service_fee: Number(body.calculateAssembledFee) || 0,
      production: Number(body.calculateProductionCosts) || 0,
      adserving: Number(body.calculateAdServingFees) || 0,
      totals_ex_gst: exGst,
      total_inc_gst: addGst(exGst),
    },
    billingSchedule: (Array.isArray(body.billingMonths) ? body.billingMonths : []).map(
      (m: { monthYear: string; totalAmount: string }) => ({
        monthYear: m.monthYear,
        totalAmount: m.totalAmount,
      })
    ),
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRole(req, ["admin", "manager"])
    if ("response" in gate) return gate.response

    const body = (await req.json()) as Record<string, unknown>
    const docsMode = resolvePlanCDocsFromPersistedMode()

    if (docsMode === "on") {
      const mbaNumber = String(body.mba_number ?? body.mbanumber ?? "").trim()
      const versionNumber = Number(body.version_number ?? body.mp_plannumber ?? body.version)
      if (!mbaNumber || !Number.isFinite(versionNumber) || versionNumber <= 0) {
        return NextResponse.json(
          {
            error:
              "PLANC_DOCS_FROM_PERSISTED requires { mba_number, version_number } (client totals are ignored)",
          },
          { status: 400 }
        )
      }

      let baseUrl: string
      try {
        baseUrl = getXanoBaseUrl([...MEDIA_PLANS_ENV_KEYS])
      } catch {
        return NextResponse.json(
          { error: "XANO_MEDIA_PLANS_BASE_URL is not configured" },
          { status: 500 }
        )
      }

      const version = await loadMediaPlanVersion({
        mbaNumber,
        versionNumber,
        baseUrl,
      })
      if (!version) {
        return NextResponse.json(
          { error: `Version ${versionNumber} not found for MBA ${mbaNumber}` },
          { status: 404 }
        )
      }

      if (!versionCarriesMbaApproval(version)) {
        return NextResponse.json(
          {
            error:
              "MBA document requires a version that carries approval (campaign_status pending-approval|approved|booked|completed, or partialApproval metadata on the billing schedule)",
            code: "mba_approval_required",
          },
          { status: 422 }
        )
      }

      const clientName = String(
        version.mp_client_name ?? version.client_name ?? version.mp_clientname ?? ""
      )
      let clientAddress: {
        streetaddress?: string
        suburb?: string
        state?: string
        postcode?: string
      } | null = null
      try {
        const clients = await getCachedClients()
        const master = await loadMediaPlanMaster(mbaNumber, baseUrl)
        const preferId = resolvePlanCReadRowsMode("docs") === "on"
        const resolved = resolveMbaClientAddress({
          clients: clients as Record<string, unknown>[],
          version,
          master,
          clientName,
          preferId,
        })
        clientAddress = resolved.address
        if (preferId && resolved.resolvedVia !== "id") {
          console.warn("[mba/generate] client address: prefer id but resolved via", {
            resolvedVia: resolved.resolvedVia,
            clientsId: resolved.clientsId,
            mba: mbaNumber,
            version: versionNumber,
            hasVersionClientId: Boolean(
              version.clients_id ?? version.mp_clients_id ?? version.client_id
            ),
            hasMasterClientId: Boolean(
              master?.clients_id ?? master?.mp_clients_id ?? master?.client_id
            ),
          })
        }
      } catch (e) {
        console.warn("[mba/generate] client address lookup failed", e)
      }

      // Plan C S2-P5 — optional plan_*_rows hydrate behind PLANC_READ_ROWS_DOCS
      await attachPlanRowSchedulesForSurface([version], "docs")

      const versionId = version.id as string | number | undefined
      const feeLoading =
        versionId != null && String(versionId).trim() !== ""
          ? await readFeeSnapshot(versionId, { baseUrl })
          : null

      let built
      try {
        built = buildMbaDataFromPersistedVersion({
          version,
          mbaNumber,
          clientAddress,
          feeLoading,
        })
      } catch (e) {
        return NextResponse.json(
          {
            error: e instanceof Error ? e.message : "Failed to build MBA from persisted version",
          },
          { status: 422 }
        )
      }

      const pdfBlob = await generateMBA(built.mbaData)
      const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer())
      const filename = `MBA_${built.mbaData.client.name || "client"}_${built.mbaData.campaign_name || "campaign"}.pdf`
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-PlanC-Schedule-Checksum": built.checksumShort,
          "X-PlanC-Docs-Mode": "persisted",
        },
      })
    }

    // --- Legacy path (flag off): client-supplied totals verbatim ---
    const mbaNumber = body.mba_number || body.mbanumber
    if (!mbaNumber || !body.mp_client_name) {
      return NextResponse.json({ error: "Missing required MBA data" }, { status: 400 })
    }

    const dataForPdf = legacyMbaDataFromBody(body)
    const pdfBuffer = await generateMBA(dataForPdf)

    const filename = `MBA_${body.mp_client_name}_${body.mp_campaignname}.pdf`
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Error generating MBA PDF:", error)
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred"
    return NextResponse.json(
      { error: "Failed to generate PDF", details: errorMessage },
      { status: 500 }
    )
  }
}
