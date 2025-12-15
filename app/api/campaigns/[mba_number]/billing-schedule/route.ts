import { NextResponse } from "next/server"
import { generateBillingSchedulePDF } from "@/lib/generateBillingSchedulePDF"
import { format } from 'date-fns'
import axios from "axios"

const MEDIA_PLANS_VERSIONS_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"
const MEDIA_PLAN_MASTER_URL = "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mba_number: string }> }
) {
  try {
    const { mba_number } = await params

    // Fetch media plan version data
    const masterQueryUrl = `${MEDIA_PLAN_MASTER_URL}/media_plan_master?mba_number=${encodeURIComponent(mba_number)}`
    const masterResponse = await axios.get(masterQueryUrl)

    let masterData: any = null
    if (Array.isArray(masterResponse.data)) {
      masterData = masterResponse.data.find((item: any) => item.mba_number === mba_number)
      if (!masterData && masterResponse.data.length > 0) {
        masterData = masterResponse.data[0]
      }
    } else {
      masterData = masterResponse.data
    }

    if (!masterData) {
      return NextResponse.json(
        { error: `Media plan master not found for MBA number: ${mba_number}` },
        { status: 404 }
      )
    }

    // Get the latest version
    const versionQueryUrl = `${MEDIA_PLANS_VERSIONS_URL}/media_plan_versions?media_plan_master_id=${masterData.id}&version_number=${masterData.version_number}`
    const versionResponse = await axios.get(versionQueryUrl)

    let versionData: any = null
    if (Array.isArray(versionResponse.data)) {
      versionData = versionResponse.data.find((item: any) =>
        item.media_plan_master_id === masterData.id &&
        item.version_number === masterData.version_number
      )
    } else {
      versionData = versionResponse.data
    }

    if (!versionData) {
      return NextResponse.json(
        { error: "Media plan version not found" },
        { status: 404 }
      )
    }

    // Extract billing schedule
    let billingSchedule: any = null
    if (versionData.billingSchedule) {
      try {
        billingSchedule = typeof versionData.billingSchedule === "string"
          ? JSON.parse(versionData.billingSchedule)
          : versionData.billingSchedule
      } catch (e) {
        console.warn("Failed to parse billing schedule:", e)
        return NextResponse.json(
          { error: "Invalid billing schedule data" },
          { status: 400 }
        )
      }
    }

    if (!billingSchedule || !Array.isArray(billingSchedule) || billingSchedule.length === 0) {
      return NextResponse.json(
        { error: "No billing schedule data available for this campaign" },
        { status: 404 }
      )
    }

    // Prepare PDF data
    const pdfData = {
      date: format(new Date(), 'dd/MM/yyyy'),
      mba_number: mba_number,
      campaign_name: versionData.campaign_name || versionData.mp_campaignname || '',
      campaign_brand: versionData.mp_brand || versionData.brand || '',
      client_name: versionData.mp_client_name || versionData.client_name || '',
      billingSchedule: billingSchedule
    }

    // Generate PDF
    const pdfBlob = await generateBillingSchedulePDF(pdfData)
    const arrayBuffer = await pdfBlob.arrayBuffer()

    // Return PDF
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="billing-schedule-${mba_number}.pdf"`,
      },
    })
  } catch (error) {
    console.error("Error generating billing schedule PDF:", error)

    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        {
          error: `Failed to generate billing schedule: ${error.message}`,
          details: {
            status: error.response?.status,
            statusText: error.response?.statusText,
          }
        },
        { status: error.response?.status || 500 }
      )
    }

    return NextResponse.json(
      {
        error: "Failed to generate billing schedule PDF",
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}




































































