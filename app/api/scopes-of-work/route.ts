import { NextResponse } from "next/server"
import axios from "axios"

const XANO_SCOPES_BASE_URL = process.env.XANO_SCOPES_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:idlsZiVX"
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    
    let url = `${XANO_SCOPES_BASE_URL}/scope_of_work`;
    if (status) {
      url += `?project_status=${status}`;
    }
    
    const response = await retryApiCall(() => 
      apiClient.get(url)
    );
    
    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Failed to fetch scopes of work:", error);
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: "Failed to fetch scopes of work", details: error.response?.data },
        { status: error.response?.status || 500 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch scopes of work" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));
    
    // Validate required fields
    const requiredFields = [
      "client_name",
      "contact_name",
      "contact_email",
      "scope_date",
      "scope_version",
      "project_name",
      "project_status",
    ];
    
    const missingFields = requiredFields.filter(field => !body[field]);
    
    if (missingFields.length > 0) {
      console.error("Missing required fields:", missingFields);
      return NextResponse.json(
        { error: "Missing required fields", details: missingFields },
        { status: 400 }
      );
    }
    
    // Prepare the data for Xano
    const scopeData = {
      client_name: body.client_name,
      contact_name: body.contact_name,
      contact_email: body.contact_email,
      scope_date: body.scope_date,
      scope_version: body.scope_version,
      project_name: body.project_name,
      project_status: body.project_status,
      project_overview: body.project_overview || "",
      deliverables: body.deliverables || "",
      tasks_steps: body.tasks_steps || "",
      timelines: body.timelines || "",
      responsibilities: body.responsibilities || "",
      requirements: body.requirements || "",
      assumptions: body.assumptions || "",
      exclusions: body.exclusions || "",
      cost: body.cost || [],
      payment_terms_and_conditions: body.payment_terms_and_conditions || "",
      billing_schedule: body.billing_schedule ? JSON.stringify(body.billing_schedule) : null,
      scope_id: body.scope_id || "",
    };
    
    const response = await retryApiCall(() => 
      apiClient.post(`${XANO_SCOPES_BASE_URL}/scope_of_work`, scopeData)
    );
    
    console.log("API response:", JSON.stringify(response.data, null, 2));
    return NextResponse.json(response.data, { status: 201 });
  } catch (error) {
    console.error("Failed to create scope of work:", error);
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      
      if (error.code === 'ECONNABORTED') {
        return NextResponse.json(
          { error: "Request timed out", message: "The request to the API timed out. Please try again." },
          { status: 504 }
        );
      }
      
      return NextResponse.json(
        { 
          error: "Failed to create scope of work", 
          details: error.response?.data,
          status: error.response?.status,
          message: error.message
        },
        { status: error.response?.status || 500 },
      );
    }
    return NextResponse.json(
      { error: "Failed to create scope of work", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}





