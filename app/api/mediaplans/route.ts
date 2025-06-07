import { NextResponse } from "next/server"
import axios from "axios"

const XANO_MEDIAPLANS_BASE_URL = process.env.XANO_MEDIAPLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Format the data to match the database schema
    const mediaPlanData = {
      mp_clientname: data.mp_clientname,
      mp_campaignstatus: data.mp_campaignstatus || "Draft",
      mp_campaignname: data.mp_campaignname,
      mp_campaigndates_start: data.mp_campaigndates_start,
      mp_campaigndates_end: data.mp_campaigndates_end,
      mp_brand: data.mp_brand,
      mp_clientcontact: data.mp_clientcontact,
      mp_ponumber: data.mp_ponumber,
      mp_campaignbudget: data.mp_campaignbudget,
      mbaidentifier: data.mbaidentifier,
      mbanumber: data.mbanumber,
      mp_fixedfee: data.mp_fixedfee || false,
      mp_television: data.mp_television || false,
      mp_radio: data.mp_radio || false,
      mp_newspaper: data.mp_newspaper || false,
      mp_magazines: data.mp_magazines || false,
      mp_ooh: data.mp_ooh || false,
      mp_cinema: data.mp_cinema || false,
      mp_digidisplay: data.mp_digidisplay || false,
      mp_digiaudio: data.mp_digiaudio || false,
      mp_digivideo: data.mp_digivideo || false,
      mp_bvod: data.mp_bvod || false,
      mp_integration: data.mp_integration || false,
      mp_search: data.mp_search || false,
      mp_socialmedia: data.mp_socialmedia || false,
      mp_progdisplay: data.mp_progdisplay || false,
      mp_progvideo: data.mp_progvideo || false,
      mp_progbvod: data.mp_progbvod || false,
      mp_progaudio: data.mp_progaudio || false,
      mp_progooh: data.mp_progooh || false,
      mp_influencers: data.mp_influencers || false,
      created_date: new Date().toISOString().split('T')[0], // Format as YYYY-MM-DD
      version_number: 1 // Initial version
    }

    // Send the data to Xano
    const response = await axios.post(`${XANO_MEDIAPLANS_BASE_URL}/post_mediaplan_topline`, mediaPlanData)
    
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to create media plan:", error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to create media plan";
    let statusCode = 500;
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      errorMessage = error.response?.data?.message || error.message || "Failed to create media plan";
      statusCode = error.response?.status || 500;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function GET() {
  try {
    const response = await axios.get(`${XANO_MEDIAPLANS_BASE_URL}/get_mediaplan_topline`)
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch media plans:", error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to fetch media plans";
    let statusCode = 500;
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      
      errorMessage = error.response?.data?.message || error.message || "Failed to fetch media plans";
      statusCode = error.response?.status || 500;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

