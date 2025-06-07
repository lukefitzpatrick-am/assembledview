import { NextResponse } from "next/server"
import axios from "axios"

const CARBONE_API_KEY = process.env.CARBONE_API_KEY || "YOUR_CARBONE_API_KEY"
const CARBONE_TEMPLATE_ID = "6e2f3832fdf95264f33fb862c5e132a6095e3a0ecb1e259bfc0fc4a4f7e2c7c3"

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Prepare the data for the template
    const templateData = {
      clientName: data.mp_clientname,
      campaignName: data.mp_campaignname,
      campaignStatus: data.mp_campaignstatus,
      campaignDates: `${new Date(data.mp_campaigndates_start).toLocaleDateString()} - ${new Date(data.mp_campaigndates_end).toLocaleDateString()}`,
      brand: data.mp_brand,
      clientContact: data.mp_clientcontact,
      poNumber: data.mp_ponumber,
      campaignBudget: new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(data.mp_campaignbudget),
      mbaIdentifier: data.mbaidentifier,
      mbaNumber: data.mbanumber,
      mediaTypes: {
        television: data.mp_television,
        radio: data.mp_radio,
        newspaper: data.mp_newspaper,
        magazines: data.mp_magazines,
        ooh: data.mp_ooh,
        cinema: data.mp_cinema,
        digitalDisplay: data.mp_digidisplay,
        digitalAudio: data.mp_digiaudio,
        digitalVideo: data.mp_digivideo,
        bvod: data.mp_bvod,
        integration: data.mp_integration,
        search: data.mp_search,
        socialMedia: data.mp_socialmedia,
        progDisplay: data.mp_progdisplay,
        progVideo: data.mp_progvideo,
        progBvod: data.mp_progbvod,
        progAudio: data.mp_progaudio,
        progOoh: data.mp_progooh,
        influencers: data.mp_influencers
      },
      createdDate: new Date().toLocaleDateString(),
      versionNumber: data.version_number || 1
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