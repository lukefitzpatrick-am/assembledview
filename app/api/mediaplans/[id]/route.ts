import { NextResponse } from "next/server"
import axios from "axios"

const XANO_MEDIAPLANS_BASE_URL = process.env.XANO_MEDIAPLANS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:QVYjoFmM"

// GET a single media plan by ID
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Await the params object
    const { id } = params
    const apiUrl = `${XANO_MEDIAPLANS_BASE_URL}/get_mediaplan_topline`
    console.log(`Fetching media plan with ID: ${id}`)
    console.log(`API URL: ${apiUrl}`)
    
    // Add request headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    
    // Make the request with headers and timeout
    const response = await axios.get(apiUrl, { 
      headers,
      timeout: 10000 
    })
    
    console.log("API response status:", response.status)
    console.log("API response data:", response.data)
    
    if (!response.data) {
      throw new Error("No data received from API")
    }
    
    // Find the specific media plan by ID
    const mediaPlan = Array.isArray(response.data) 
      ? response.data.find(plan => plan.id.toString() === id)
      : null
      
    if (!mediaPlan) {
      return NextResponse.json(
        { error: "Media plan not found" },
        { status: 404 }
      )
    }
    
    return NextResponse.json(mediaPlan)
  } catch (error) {
    console.error("Error fetching media plan:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      })
      
      // Return a more detailed error response
      return NextResponse.json(
        { 
          error: `Failed to fetch media plan: ${error.response?.data?.message || error.message}`,
          details: {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
          }
        },
        { status: error.response?.status || 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: "Failed to fetch media plan", 
        details: error 
      },
      { status: 500 }
    )
  }
}

// PUT (update) a media plan by ID
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Await the params object
    const { id } = params
    const data = await request.json()
    const apiUrl = `${XANO_MEDIAPLANS_BASE_URL}/edit_mediaplan_topline`
    console.log(`Updating media plan with ID: ${id}`)
    console.log(`API URL: ${apiUrl}`)
    console.log("Request data:", data)
    
    // Add request headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    
    // Make the request with headers and timeout
    const response = await axios.put(apiUrl, { ...data, id }, { 
      headers,
      timeout: 10000 
    })
    
    console.log("API response status:", response.status)
    console.log("API response data:", response.data)
    
    if (!response.data) {
      throw new Error("No data received from API")
    }
    
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Error updating media plan:", error)
    
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      })
      
      // Return a more detailed error response
      return NextResponse.json(
        { 
          error: `Failed to update media plan: ${error.response?.data?.message || error.message}`,
          details: {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
          }
        },
        { status: error.response?.status || 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: "Failed to update media plan", 
        details: error 
      },
      { status: 500 }
    )
  }
}

