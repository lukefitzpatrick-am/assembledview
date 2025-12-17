import { NextResponse } from 'next/server';
import axios from 'axios';
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from '@/lib/api/mediaPlanVersionHelper';

// Interface matching the Xano database schema
interface TelevisionData {
  id?: number;
  created_at?: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  market: string;
  network: string;
  station: string;
  daypart: string;
  placement: string;
  buy_type: string;
  buying_demo: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  line_item_id: string;
  creative: string;
  bursts_json: any; // JSON object containing bursts data
  line_item: number;
}

const XANO_TELEVISION_BASE_URL = process.env.XANO_TELEVISION_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.media_plan_version || !data.mba_number || !data.mp_client_name) {
      return NextResponse.json(
        { error: "Missing required fields: media_plan_version, mba_number, mp_client_name" },
        { status: 400 }
      );
    }

    // Format the data to match the Xano database schema
    const televisionData: TelevisionData = {
      media_plan_version: data.media_plan_version,
      mba_number: data.mba_number,
      mp_client_name: data.mp_client_name,
      mp_plannumber: data.mp_plannumber || "",
      market: data.market || "",
      network: data.network || "",
      station: data.station || "",
      daypart: data.daypart || "",
      placement: data.placement || "",
      buy_type: data.buy_type || "",
      buying_demo: data.buying_demo || "",
      fixed_cost_media: data.fixed_cost_media || false,
      client_pays_for_media: data.client_pays_for_media || false,
      budget_includes_fees: data.budget_includes_fees || false,
      line_item_id: data.line_item_id || "",
      creative: data.creative || "",
      bursts_json: data.bursts_json || {},
      line_item: data.line_item || 1,
    };

    // Send the data to Xano
    const response = await fetch(`${XANO_TELEVISION_BASE_URL}/media_plan_television`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(televisionData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to save television data");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving television data:", error);
    
    let errorMessage = "Failed to save television data";
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mbaNumber = searchParams.get('mba_number');
    const mediaPlanVersion = searchParams.get('media_plan_version');
    const mpPlanNumber = searchParams.get('mp_plannumber');
    
    // mba_number is required
    if (!mbaNumber) {
      return NextResponse.json(
        { error: "mba_number is required" },
        { status: 400 }
      );
    }
    
    // Get the version_number from media_plan_versions table for this mba_number
    let versionNumber: string | null = null;
    
    try {
      versionNumber = await getVersionNumberForMBA(mbaNumber, mpPlanNumber, mediaPlanVersion);
    } catch (versionError) {
      console.error("Error fetching version number from media_plan_versions:", versionError);
      return NextResponse.json(
        { error: "Failed to determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      );
    }
    
    if (!versionNumber) {
      return NextResponse.json(
        { error: "Could not determine version number. Please provide mp_plannumber or media_plan_version." },
        { status: 400 }
      );
    }
    
    // Query ONLY by mba_number to scan entire database
    // Then filter by mp_plannumber in JavaScript to ensure we get all matching records
    const params = new URLSearchParams();
    params.append('mba_number', mbaNumber);
    
    const url = `${XANO_TELEVISION_BASE_URL}/media_plan_television?${params.toString()}`;
    
    console.log(`[TELEVISION] Fetching from media_plan_television table`);
    console.log(`[TELEVISION] Strategy: Query all records matching mba_number, then filter by mp_plannumber=${versionNumber} in JavaScript`);
    console.log(`[TELEVISION] API URL: ${url}`);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    const response = await axios.get(url, { 
      headers,
      timeout: 10000 
    });
    
    console.log(`[TELEVISION] API response status: ${response.status}`);
    console.log(`[TELEVISION] Raw response data count:`, Array.isArray(response.data) ? response.data.length : 'not an array');
    
    // Ensure we return an array
    const data = Array.isArray(response.data) ? response.data : [];
    
    // Strict client-side filtering to ensure exact matches
    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, 'TELEVISION');
    
    console.log(`[TELEVISION] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);
    
    return NextResponse.json(filteredData);
  } catch (error) {
    console.error("Error fetching television data:", error);
    
    if (axios.isAxiosError(error)) {
      // If it's a 404, return empty array (no data found is not an error)
      if (error.response?.status === 404) {
        console.log("Television line items not found (404), returning empty array");
        return NextResponse.json([]);
      }
      
      console.error("Axios error details:", {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers,
      });
      
      return NextResponse.json(
        { 
          error: `Failed to fetch television data: ${error.response?.data?.message || error.message}`,
          details: {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
          }
        },
        { status: error.response?.status || 500 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch television data" },
      { status: 500 }
    );
  }
}


