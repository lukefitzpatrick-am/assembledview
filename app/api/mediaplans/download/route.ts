import { NextResponse } from "next/server"
import axios from "axios"
import { generateMediaPlan, MediaPlanHeader } from '@/lib/generateMediaPlan'

const CARBONE_API_KEY = process.env.CARBONE_API_KEY || "YOUR_CARBONE_API_KEY"
const CARBONE_TEMPLATE_ID = "6e2f3832fdf95264f33fb862c5e132a6095e3a0ecb1e259bfc0fc4a4f7e2c7c3"

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Prepare the data for the template
    const templateData = {
      clientName: data.mp_clientname,
      campaignName: data.mp_campaignname,
      campaignDates: `${data.mp_campaigndates_start} - ${data.mp_campaigndates_end}`,
      brand: data.mp_brand,
      clientContact: data.mp_clientcontact,
      poNumber: data.mp_ponumber,
      campaignBudget: data.mp_campaignbudget,
      mbaIdentifier: data.mbaidentifier,
      mbaNumber: data.mbanumber,
      // Add other relevant data for the PDF template
    }
    
    // Call Carbone API to generate the PDF
    const response = await axios.post(
      "https://api.carbone.io/render",
      {
        template: CARBONE_TEMPLATE_ID,
        data: templateData,
        options: {
          reportName: `MediaPlan_${data.mp_clientname}_${data.mp_campaignname}`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CARBONE_API_KEY}`,
        },
        responseType: "arraybuffer",
      }
    )
    
    // Return the PDF as a response
    return new NextResponse(response.data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=MediaPlan_${data.mp_clientname}_${data.mp_campaignname}.pdf`,
      },
    })
  } catch (error) {
    console.error("Failed to generate media plan PDF:", error)
    return NextResponse.json(
      { error: "Failed to generate media plan PDF" },
      { status: 500 }
    )
  }
} 