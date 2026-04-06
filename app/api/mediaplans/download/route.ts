import { NextResponse } from "next/server"
import { generateMediaPlan, MediaPlanHeader, addKPISheet } from "@/lib/generateMediaPlan"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { kpiRows, ...rest } = body

    // Prepare the header data for the Excel generation
    const header: MediaPlanHeader = {
      logoBase64: rest.logoBase64 || '',
      logoWidth: rest.logoWidth || 457,
      logoHeight: rest.logoHeight || 71,
      client: rest.mp_client_name || '',
      brand: rest.mp_brand || '',
      campaignName: rest.mp_campaignname || '',
      mbaNumber: rest.mbanumber || '',
      clientContact: rest.mp_clientcontact || '',
      planVersion: rest.version_number || '1',
      poNumber: rest.mp_ponumber || '',
      campaignBudget: rest.mp_campaignbudget || '0',
      campaignStatus: rest.mp_campaignstatus || '',
      campaignStart: rest.mp_campaigndates_start || '',
      campaignEnd: rest.mp_campaigndates_end || '',
    }

    // Prepare the media items data
    const mediaItems = {
      search: rest.search || [],
      socialMedia: rest.socialMedia || [],
      digiAudio: rest.digiAudio || [],
      digiDisplay: rest.digiDisplay || [],
      digiVideo: rest.digiVideo || [],
      bvod: rest.bvod || [],
      progDisplay: rest.progDisplay || [],
      progVideo: rest.progVideo || [],
      progBvod: rest.progBvod || [],
      progOoh: rest.progOoh || [],
      progAudio: rest.progAudio || [],
      newspaper: rest.newspaper || [],
      magazines: rest.magazines || [],
      television: rest.television || [],
      radio: rest.radio || [],
      ooh: rest.ooh || [],
      cinema: rest.cinema || [],
      integration: rest.integration || [],
      production: rest.production || [],
    }

    // Generate the Excel workbook
    const mbaData = rest.mbaData
    const workbook = await generateMediaPlan(header, mediaItems, mbaData)

    if (Array.isArray(kpiRows) && kpiRows.length > 0) {
      addKPISheet(workbook, kpiRows)
    }

    // Convert workbook to buffer
    const buffer = await workbook.xlsx.writeBuffer()
    
    // Return the Excel file as a response
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=MediaPlan_${rest.mp_client_name}_${rest.mp_campaignname}.xlsx`,
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
