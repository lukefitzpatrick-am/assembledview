import { NextResponse } from "next/server"
import { generateMediaPlan, MediaPlanHeader } from '@/lib/generateMediaPlan'

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
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
    }

    // Generate the Excel workbook
    const workbook = await generateMediaPlan(header, mediaItems)
    
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