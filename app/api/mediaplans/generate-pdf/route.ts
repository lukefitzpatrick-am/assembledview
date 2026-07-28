import { NextRequest, NextResponse } from "next/server"
import { generateMediaPlan, MediaPlanHeader } from '@/lib/generateMediaPlan'
import { requireRole } from "@/lib/requireRole"
import { resolvePlanCDocsFromPersistedMode } from "@/lib/finance/planCDocsFromPersisted"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const maxDuration = 60

export async function POST(request: NextRequest) {
    try {
    const gate = await requireRole(request, ["admin", "manager"])
    if ("response" in gate) return gate.response

    const data = await request.json()

    // Plan C S1-P4: this route historically accepted client-computed line money.
    // UI create/edit generate Excel in-browser (generateMediaPlan) — they do not
    // call this API. Under the flag we refuse client totals rather than invent a
    // channel→MediaItems mapper (that would risk approximating line money).
    if (resolvePlanCDocsFromPersistedMode() === "on") {
      return NextResponse.json(
        {
          error:
            "PLANC_DOCS_FROM_PERSISTED: /api/mediaplans/generate-pdf client totals are disabled. Media plan Excel is produced client-side; server Excel-from-version is not wired (no channel→MediaItems mapper). MBA PDF uses POST /api/mba/generate with { mba_number, version_number }.",
          code: "docs_from_persisted_excel_unwired",
        },
        { status: 422 }
      )
    }
    
    // Prepare the header data for the Excel generation
    const header: MediaPlanHeader = {
      logoBase64: data.logoBase64 || '',
      logoWidth: data.logoWidth || 457,
      logoHeight: data.logoHeight || 71,
      client: data.mp_client_name || '',
      brand: data.mp_brand || '',
      campaignName: data.mp_campaignname || '',
      mbaNumber: data.mbanumber || '',
      clientContact: data.mp_clientcontact || '',
      planVersion: data.version_number || '1',
      poNumber: data.mp_ponumber || '',
      campaignBudget: data.mp_campaignbudget || '0',
      campaignStatus: data.mp_campaignstatus || '',
      campaignStart: data.mp_campaigndates_start || '',
      campaignEnd: data.mp_campaigndates_end || '',
    }

    // Prepare the media items data
    const mediaItems = {
      search: data.search || [],
      socialMedia: data.socialMedia || [],
      digiAudio: data.digiAudio || [],
      digiDisplay: data.digiDisplay || [],
      digiVideo: data.digiVideo || [],
      bvod: data.bvod || [],
      progDisplay: data.progDisplay || [],
      progVideo: data.progVideo || [],
      progBvod: data.progBvod || [],
      progOoh: data.progOoh || [],
      progAudio: data.progAudio || [],
      newspaper: data.newspaper || [],
      magazines: data.magazines || [],
      television: data.television || [],
      radio: data.radio || [],
      ooh: data.ooh || [],
      cinema: data.cinema || [],
      integration: data.integration || [],
      influencers: data.influencers || [],
      production: data.production || [],
    }

    // Generate the Excel workbook
    const mbaData = data.mbaData
    const workbook = await generateMediaPlan(header, mediaItems, mbaData)
    
    // Convert workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer()
    
    // Return the Excel file as a response
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=MediaPlan_${data.mp_client_name}_${data.mp_campaignname}.xlsx`,
      },
    })
  } catch (error) {
    console.error("Failed to generate media plan Excel:", error)
    return NextResponse.json(
      { error: "Failed to generate media plan Excel" },
      { status: 500 }
    )
  }
} 