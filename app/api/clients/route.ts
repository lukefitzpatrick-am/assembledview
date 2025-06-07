import { NextResponse } from "next/server"
import axios from "axios"

const XANO_CLIENTS_BASE_URL = process.env.XANO_CLIENTS_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:9v_k2NR8" //Added default value
const API_TIMEOUT = 10000; // 10 seconds timeout

// Create an axios instance with default config
const apiClient = axios.create({
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Helper function to retry API calls
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      console.error(`API call attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw lastError;
}

export async function GET() {
  try {
    const response = await retryApiCall(() => 
      apiClient.get(`${XANO_CLIENTS_BASE_URL}/get_clients`)
    );
    return NextResponse.json(response.data)
  } catch (error) {
    console.error("Failed to fetch clients:", error)
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log("Request body:", JSON.stringify(body, null, 2))
    
    // Validate required fields
    const requiredFields = ["clientname_input", "clientcategory", "abn", "legalbusinessname", "streetaddress", "suburb", "state_dropdown", "postcode"]
    const missingFields = requiredFields.filter(field => !body[field])
    
    if (missingFields.length > 0) {
      console.error("Missing required fields:", missingFields)
      return NextResponse.json(
        { error: "Missing required fields", details: missingFields },
        { status: 400 }
      )
    }
    
    // Log the API URL being used
    console.log("Using API URL:", `${XANO_CLIENTS_BASE_URL}/post_clients`)
    
    const response = await retryApiCall(() => 
      apiClient.post(`${XANO_CLIENTS_BASE_URL}/post_clients`, body)
    );
    
    console.log("API response:", JSON.stringify(response.data, null, 2))
    return NextResponse.json(response.data, { status: 201 })
  } catch (error) {
    console.error("Failed to create client:", error)
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers,
        code: error.code,
        message: error.message
      })
      
      // Handle timeout errors specifically
      if (error.code === 'ECONNABORTED') {
        return NextResponse.json(
          { error: "Request timed out", message: "The request to the API timed out. Please try again." },
          { status: 504 }
        )
      }
      
      return NextResponse.json(
        { 
          error: "Failed to create client", 
          details: error.response?.data,
          status: error.response?.status,
          message: error.message
        },
        { status: error.response?.status || 500 },
      )
    }
    return NextResponse.json(
      { error: "Failed to create client", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

