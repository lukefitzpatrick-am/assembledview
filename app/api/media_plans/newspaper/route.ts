import { NextResponse } from 'next/server';
import axios from 'axios';
import { getVersionNumberForMBA, filterLineItemsByPlanNumber } from '@/lib/api/mediaPlanVersionHelper';

// Interface matching the Xano database schema
interface NewspaperData {
  id?: number;
  created_at?: number;
  media_plan_version: number;
  mba_number: string;
  mp_client_name: string;
  mp_plannumber: string;
  network: string;
  title: string;
  buy_type: string;
  size: string;
  format: string;
  placement: string;
  buying_demo: string;
  market: string;
  fixed_cost_media: boolean;
  client_pays_for_media: boolean;
  budget_includes_fees: boolean;
  line_item_id: string;
  bursts_json: any; // JSON object containing bursts data
  line_item: number;
}

const XANO_NEWSPAPER_BASE_URL = process.env.XANO_NEWSPAPER_BASE_URL || "https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa";

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
    const newspaperData: NewspaperData = {
      media_plan_version: data.media_plan_version,
      mba_number: data.mba_number,
      mp_client_name: data.mp_client_name,
      mp_plannumber: data.mp_plannumber || "",
      network: data.network || "",
      title: data.title || "",
      buy_type: data.buy_type || "",
      size: data.size || "",
      format: data.format || "",
      placement: data.placement || "",
      buying_demo: data.buying_demo || "",
      market: data.market || "",
      fixed_cost_media: data.fixed_cost_media || false,
      client_pays_for_media: data.client_pays_for_media || false,
      budget_includes_fees: data.budget_includes_fees || false,
      line_item_id: data.line_item_id || "",
      bursts_json: data.bursts_json || {},
      line_item: data.line_item || 1,
    };

    // Send the data to Xano
    const response = await fetch(`${XANO_NEWSPAPER_BASE_URL}/media_plan_newspaper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newspaperData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to save newspaper data");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error saving newspaper data:", error);
    
    let errorMessage = "Failed to save newspaper data";
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
    
    // Get the version_number from media_plan_versions table for this mba_number
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
    
    const url = `${XANO_NEWSPAPER_BASE_URL}/media_plan_newspaper?${params.toString()}`;
    
    console.log(`[NEWSPAPER] Fetching from media_plan_newspaper table`);
    console.log(`[NEWSPAPER] Strategy: Query all records matching mba_number, then filter by mp_plannumber=${versionNumber} in JavaScript`);
    console.log(`[NEWSPAPER] API URL: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`[NEWSPAPER] API response status: ${response.status}`);
    console.log(`[NEWSPAPER] Raw response data count:`, Array.isArray(response.data) ? response.data.length : 'not an array');
    
    // Ensure we return an array
    const data = Array.isArray(response.data) ? response.data : [];
    
    // Strict client-side filtering to ensure exact matches
    const filteredData = filterLineItemsByPlanNumber(data, mbaNumber, versionNumber, 'NEWSPAPER');
    
    console.log(`[NEWSPAPER] Final filtered data count: ${filteredData.length} (from ${data.length} total items)`);
    
    return NextResponse.json(filteredData);
  } catch (error) {
    console.error("Error fetching newspaper data:", error);
    return NextResponse.json(
      { error: "Failed to fetch newspaper data" },
      { status: 500 }
    );
  }
}
